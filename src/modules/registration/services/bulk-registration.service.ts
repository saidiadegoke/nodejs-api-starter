import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { normalizeNin, hashNin, ninLast4 } from '../../identity/utils/identity-crypto.util';
import { RegistrationStatus } from '../../../shared/enums';
import { RegistrationEntity } from '../entities/registration.entity';
import { NinVerificationEntity, NinVerificationStatus } from '../../identity/entities/nin-verification.entity';

export interface BulkRegistrationError {
  row: number;
  first_name?: string;
  last_name?: string;
  middle_name?: string;
  name?: string;
  email?: string;
  phone?: string;
  nin?: string;
  nin_last4?: string;
  combination_code?: string;
  error_code?: string;
  error: string;
}

export interface BulkRegistrationResult {
  total_rows: number;
  successful: number;
  failed: number;
  errors: BulkRegistrationError[];
  registrations: RegistrationEntity[];
}

function parseCombinationInput(rawInput: any) {
  if (!rawInput) return { raw: '', codePart: '', codeCandidates: [] as string[], subjectCodes: [] as string[] };
  const raw = String(rawInput).trim().replace(/^['’`"]+|['’`"]+$/g, '').trim();

  let extractedSubjects: string[] = [];
  const parenMatch = raw.match(/\(([^)]+)\)/);
  if (parenMatch) {
    extractedSubjects = parenMatch[1]
      .split(/[,/|+]/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }

  let codeWithoutParen = raw.replace(/\([^)]*\)/g, '').trim();
  codeWithoutParen = codeWithoutParen.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

  if (extractedSubjects.length === 0 && codeWithoutParen.includes('-')) {
    const parts = codeWithoutParen.split('-');
    if (parts.length === 2 && parts[1].includes(',')) {
      codeWithoutParen = parts[0].trim();
      extractedSubjects = parts[1]
        .split(/[,/|+]/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
    }
  }

  if (extractedSubjects.length === 0 && raw.includes(',')) {
    const parts = raw.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    if (parts.length >= 2 && parts.every((p) => p.length <= 10 && !p.includes(' '))) {
      extractedSubjects = parts;
    }
  }

  const codeCandidates = new Set<string>();
  if (codeWithoutParen) {
    codeCandidates.add(codeWithoutParen.toLowerCase());
    const noJupeb = codeWithoutParen.replace(/^jupeb[\s_-]*/i, '').trim();
    if (noJupeb) {
      codeCandidates.add(noJupeb.toLowerCase());
      codeCandidates.add(noJupeb.replace(/[\s_-]+/g, '').toLowerCase());
    }
    if (!/^jupeb/i.test(codeWithoutParen)) {
      codeCandidates.add(`jupeb ${codeWithoutParen}`.toLowerCase());
      codeCandidates.add(`jupeb-${codeWithoutParen}`.toLowerCase());
    }
  }

  return {
    raw,
    codePart: codeWithoutParen,
    codeCandidates: Array.from(codeCandidates),
    subjectCodes: extractedSubjects,
  };
}

@Injectable()
export class BulkRegistrationService {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly registrationRepo: Repository<RegistrationEntity>,
    @InjectRepository(NinVerificationEntity)
    private readonly ninVerificationRepo: Repository<NinVerificationEntity>,
    private readonly dataSource: DataSource,
  ) {}

  async bulkUpload(
    fileBuffer: Buffer,
    sessionId: string,
    universityId: string,
    userId?: string | null,
  ): Promise<BulkRegistrationResult> {
    if (!fileBuffer || !fileBuffer.length) {
      throw new UnprocessableEntityException('No file buffer uploaded');
    }

    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    } catch {
      throw new UnprocessableEntityException('Unable to parse spreadsheet file');
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new UnprocessableEntityException('Spreadsheet contains no sheets');
    }

    const sheet = workbook.Sheets[sheetName];
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

    if (!rows.length) {
      return {
        total_rows: 0,
        successful: 0,
        failed: 0,
        errors: [],
        registrations: [],
      };
    }

    // Preload active combinations with items for matching
    const activeCombos: any[] = await this.dataSource.query(
      `SELECT sc.id, sc.code, sc.title, sc.is_global, sc.university_id,
              COALESCE(ARRAY_AGG(s.code ORDER BY sci.position) FILTER (WHERE s.code IS NOT NULL), '{}') as subject_codes
       FROM jupeb_subject_combinations sc
       LEFT JOIN jupeb_subject_combination_items sci ON sci.combination_id = sc.id
       LEFT JOIN jupeb_subjects s ON s.id = sci.subject_id
       WHERE sc.deleted_at IS NULL AND sc.status = 'active'
         AND (sc.is_global = true OR sc.university_id = $1)
       GROUP BY sc.id, sc.code, sc.title, sc.is_global, sc.university_id`,
      [universityId],
    );

    const comboList = activeCombos.map((combo) => {
      const subjectCodes: string[] = (combo.subject_codes || []).map((c: string) => String(c).trim().toUpperCase());
      const sortedSubjectCodes = [...subjectCodes].sort().join(',');
      const rawCode = String(combo.code || '').trim();
      const noPrefixCode = rawCode.replace(/^jupeb[\s_-]*/i, '').trim();

      const codeVariants = new Set<string>([
        rawCode.toLowerCase(),
        noPrefixCode.toLowerCase(),
        rawCode.replace(/[\s_-]+/g, '').toLowerCase(),
        noPrefixCode.replace(/[\s_-]+/g, '').toLowerCase(),
        `jupeb ${noPrefixCode}`.toLowerCase(),
        `jupeb-${noPrefixCode}`.toLowerCase(),
      ]);

      return {
        ...combo,
        subjectCodes,
        sortedSubjectCodes,
        codeVariants,
      };
    });

    const resolveCombo = (rawCode?: string) => {
      if (!rawCode || !String(rawCode).trim()) return null;
      const parsed = parseCombinationInput(rawCode);

      if (parsed.codeCandidates.length > 0 && parsed.subjectCodes.length > 0) {
        const sortedTarget = [...parsed.subjectCodes].sort().join(',');
        for (const c of comboList) {
          const codeMatches = parsed.codeCandidates.some((cand) => c.codeVariants.has(cand));
          if (
            codeMatches &&
            (c.sortedSubjectCodes === sortedTarget ||
              parsed.subjectCodes.every((sc) => c.subjectCodes.includes(sc)))
          ) {
            return c;
          }
        }
      }

      if (parsed.codeCandidates.length > 0) {
        for (const c of comboList) {
          if (parsed.codeCandidates.some((cand) => c.codeVariants.has(cand))) {
            return c;
          }
        }
      }

      if (parsed.subjectCodes.length > 0) {
        const sortedTarget = [...parsed.subjectCodes].sort().join(',');
        for (const c of comboList) {
          if (
            c.sortedSubjectCodes === sortedTarget ||
            (parsed.subjectCodes.length === c.subjectCodes.length &&
              parsed.subjectCodes.every((sc) => c.subjectCodes.includes(sc)))
          ) {
            return c;
          }
        }
      }

      if (parsed.raw) {
        const lowRaw = parsed.raw.toLowerCase();
        for (const c of comboList) {
          if (c.title && (c.title.toLowerCase() === lowRaw || c.title.toLowerCase().includes(lowRaw))) {
            return c;
          }
        }
      }

      return null;
    };

    const errors: BulkRegistrationError[] = [];
    const registrations: RegistrationEntity[] = [];
    let successful = 0;

    const maxSerialRecord = await this.registrationRepo
      .createQueryBuilder('r')
      .select('COALESCE(MAX(r.provisional_serial), 0)', 'max_serial')
      .where('r.session_id = :sessionId', { sessionId })
      .getRawOne();

    let currentSerial = Number(maxSerialRecord?.max_serial || 0);
    const seenNinsInBatch = new Set<string>();

    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      const rowNumber = idx + 2;

      const clean: Record<string, string> = {};
      for (const [key, val] of Object.entries(row)) {
        const k = String(key || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
        let strVal = typeof val === 'string' ? val.trim() : (val != null ? String(val).trim() : '');
        strVal = strVal.replace(/^['’`"]+/, '').trim();
        clean[k] = strVal;
      }

      const firstName = clean.firstname || clean.first || '';
      const lastName = clean.lastname || clean.surname || clean.last || '';
      const middleName = clean.middlename || clean.middle || clean.othername || clean.othernames || '';
      const email = clean.email || clean.emailaddress || '';
      const phone = clean.phone || clean.phonenumber || clean.telephoneno || clean.mobile || '';
      const rawNin = clean.nin || clean.nationalid || clean.ninnumber || row.nin || row.NIN;
      const rawCombo =
        clean.combinationcode ||
        clean.subjectcombination ||
        clean.combination ||
        clean.subjectcombinationcode ||
        clean.subjects ||
        row.combination_code ||
        row['combination_code'] ||
        '';

      const normNin = normalizeNin(rawNin);

      if (!normNin || normNin.length !== 11) {
        errors.push({
          row: rowNumber,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          nin: rawNin ? String(rawNin) : undefined,
          nin_last4: normNin ? ninLast4(normNin) : undefined,
          combination_code: rawCombo,
          error_code: 'invalid_nin',
          error: `Invalid 11-digit NIN: received "${rawNin ?? ''}"`,
        });
        continue;
      }

      if (seenNinsInBatch.has(normNin)) {
        errors.push({
          row: rowNumber,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          nin: normNin,
          nin_last4: ninLast4(normNin),
          combination_code: rawCombo,
          error_code: 'duplicate_in_file',
          error: 'Duplicate NIN in uploaded file',
        });
        continue;
      }
      seenNinsInBatch.add(normNin);

      const matchedCombo = resolveCombo(rawCombo);
      if (rawCombo && !matchedCombo) {
        errors.push({
          row: rowNumber,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          nin: normNin,
          nin_last4: ninLast4(normNin),
          combination_code: rawCombo,
          error_code: 'invalid_subject_combination',
          error: `Subject combination '${rawCombo}' not found or inactive`,
        });
        continue;
      }

      try {
        const hashed = hashNin(normNin);
        const last4 = ninLast4(normNin);

        let ninVerification = await this.ninVerificationRepo.findOne({
          where: { ninHash: hashed },
        });

        if (!ninVerification) {
          ninVerification = await this.ninVerificationRepo.save(
            this.ninVerificationRepo.create({
              ninHash: hashed,
              ninLast4: last4,
              provider: 'bulk_upload',
              status: NinVerificationStatus.VERIFIED,
              responsePayload: {
                first_name: firstName || undefined,
                last_name: lastName || undefined,
                middle_name: middleName || undefined,
              },
              errorPayload: {},
              intakePayload: {
                first_name: firstName,
                last_name: lastName,
                middle_name: middleName,
                name: [firstName, middleName, lastName].filter(Boolean).join(' '),
                email,
                phone,
                subject_combination_id: matchedCombo?.id || null,
                subject_combination_code: matchedCombo?.code || rawCombo,
              },
              requestedBy: userId || null,
            }),
          );
        }

        currentSerial += 1;
        const candidateCode = String(1000000 + currentSerial).slice(-7);

        const registration = this.registrationRepo.create({
          sessionId,
          universityId,
          ninVerificationId: ninVerification.id,
          subjectCombinationId: matchedCombo?.id || null,
          provisionalSerial: currentSerial,
          provisionalCandidateCode: candidateCode,
          status: RegistrationStatus.CODE_ISSUED,
          createdBy: userId || null,
        });

        const savedRegistration = await this.registrationRepo.save(registration);

        registrations.push(savedRegistration);
        successful += 1;
      } catch (err: any) {
        errors.push({
          row: rowNumber,
          first_name: firstName,
          last_name: lastName,
          middle_name: middleName,
          email,
          phone,
          nin: normNin,
          nin_last4: ninLast4(normNin),
          combination_code: rawCombo,
          error: err.message || 'Failed to register candidate',
        });
      }
    }

    return {
      total_rows: rows.length,
      successful,
      failed: errors.length,
      errors,
      registrations,
    };
  }
}
