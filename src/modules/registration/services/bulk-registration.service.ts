import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as XLSX from 'xlsx';
import { normalizeNin, hashNin, ninLast4 } from '../../identity/utils/identity-crypto.util';
import { RegistrationStatus } from '../../../shared/enums';
import { RegistrationEntity } from '../entities/registration.entity';
import { NinVerificationEntity, NinVerificationStatus } from '../../identity/entities/nin-verification.entity';
import { InstitutionUserScopeService } from './institution-user-scope.service';
import { SyncEvent } from '../../sync/constants/sync-events.enum';
import { RegistrationEvent } from '../constants/registration-events.enum';
import {
  formatProvisionalCandidateCode,
  generateUniqueInstitutionCode,
  institutionCodeExpiresAt,
} from '../utils/registration-numbering';

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
  registrations?: RegistrationEntity[];
  succeeded_count?: number;
  failed_count?: number;
  data?: any;
  success?: boolean;
}

function normalizeSubjectToken(token: string): string {
  return String(token || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, '');
}

const KNOWN_SUBJECT_ALIASES: Record<string, string> = {
  MTH: 'MAT',
  MATH: 'MAT',
  MATHS: 'MAT',
  MATHEMATICS: 'MAT',
  CHM: 'CHE',
  CHEMISTRY: 'CHE',
  CRK: 'CRS',
  'CRK-CRS': 'CRS',
  'CHRISTIAN-RELIGIOUS-STUDIES': 'CRS',
  'CHRISTIAN-RELIGIOUS-KNOWLEDGE': 'CRS',
  IRK: 'IRS',
  'ISLAMIC-RELIGIOUS-STUDIES': 'IRS',
  'ISLAMIC-RELIGIOUS-KNOWLEDGE': 'IRS',
  ECO: 'ECN',
  ECONOMICS: 'ECN',
  ACT: 'ACC',
  ACCOUNTING: 'ACC',
  'FINANCIAL-ACCOUNTING': 'ACC',
  'PRINCIPLES-OF-ACCOUNTING': 'ACC',
  'PRINCIPLES-OF-ACCOUNTS': 'ACC',
  LIT: 'LIT',
  'LIT-IN-ENG': 'LIT',
  LITERATURE: 'LIT',
  'LITERATURE-IN-ENGLISH': 'LIT',
  FAA: 'VIS',
  ART: 'VIS',
  'FINE-ARTS': 'VIS',
  'VISUAL-ARTS': 'VIS',
  AGRIC: 'AGR',
  AGRICULTURE: 'AGR',
  'AGRICULTURAL-SCIENCE': 'AGR',
  BMS: 'BUS',
  'BUSINESS-STUDIES': 'BUS',
  'BUSINESS-MANAGEMENT': 'BUS',
  FRN: 'FRE',
  FRENCH: 'FRE',
  IGB: 'IBO',
  IGBO: 'IBO',
  YOR: 'YOR',
  YORUBA: 'YOR',
  HAU: 'HAU',
  HAUSA: 'HAU',
  GEO: 'GEO',
  GEOGRAPHY: 'GEO',
  HIS: 'HIS',
  HISTORY: 'HIS',
  GOV: 'GOV',
  GOVERNMENT: 'GOV',
  BIO: 'BIO',
  BIOLOGY: 'BIO',
  PHY: 'PHY',
  PHYSICS: 'PHY',
  MUS: 'MUS',
  MUSIC: 'MUS',
};

const STANDARD_JUPEB_SUBJECTS: Record<string, { code: string; name: string }> = {
  BIO: { code: 'BIO', name: 'Biology' },
  CHE: { code: 'CHE', name: 'Chemistry' },
  PHY: { code: 'PHY', name: 'Physics' },
  MAT: { code: 'MAT', name: 'Mathematics' },
  MTH: { code: 'MAT', name: 'Mathematics' },
  ECN: { code: 'ECN', name: 'Economics' },
  ECO: { code: 'ECN', name: 'Economics' },
  GOV: { code: 'GOV', name: 'Government' },
  LIT: { code: 'LIT', name: 'Literature in English' },
  CRS: { code: 'CRS', name: 'Christian Religious Studies' },
  CRK: { code: 'CRS', name: 'Christian Religious Studies' },
  IRS: { code: 'IRS', name: 'Islamic Religious Studies' },
  IRK: { code: 'IRS', name: 'Islamic Religious Studies' },
  ACC: { code: 'ACC', name: 'Accounting' },
  ACT: { code: 'ACC', name: 'Accounting' },
  BUS: { code: 'BUS', name: 'Business Studies' },
  BMS: { code: 'BUS', name: 'Business Management' },
  GEO: { code: 'GEO', name: 'Geography' },
  HIS: { code: 'HIS', name: 'History' },
  AGR: { code: 'AGR', name: 'Agricultural Science' },
  AGRIC: { code: 'AGR', name: 'Agricultural Science' },
  YOR: { code: 'YOR', name: 'Yoruba' },
  HAU: { code: 'HAU', name: 'Hausa' },
  IBO: { code: 'IBO', name: 'Igbo' },
  IGB: { code: 'IBO', name: 'Igbo' },
  FRE: { code: 'FRE', name: 'French' },
  FRN: { code: 'FRE', name: 'French' },
  MUS: { code: 'MUS', name: 'Music' },
  VIS: { code: 'VIS', name: 'Visual Arts' },
  FAA: { code: 'VIS', name: 'Fine Arts' },
};

function parseCombinationInput(rawInput: any) {
  if (!rawInput) {
    return {
      raw: '',
      codePart: '',
      codeCandidates: [] as string[],
      subjectTokens: [] as string[],
    };
  }
  const raw = String(rawInput).trim().replace(/^['’`"]+|['’`"]+$/g, '').trim();

  let subjectTokens: string[] = [];

  // 1. Check for parentheses or brackets: "JUPEB SC-001 - (BIO / GOV / LIT)" or "[BIO, GOV, LIT]"
  const bracketMatch = raw.match(/[([]([^)\]]+)[)\]]/);
  if (bracketMatch) {
    subjectTokens = bracketMatch[1]
      .split(/[,/|+]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  // 2. Extract code part outside brackets
  let codeWithoutBrackets = raw.replace(/[([][^)\]]*[)\]]/g, '').trim();
  codeWithoutBrackets = codeWithoutBrackets.replace(/^[\s\-:|]+|[\s\-:|]+$/g, '').trim();

  // 3. If no brackets, check if string is separated by delimiters (e.g. "BIO / GOV / LIT", "BIO, GOV, LIT", "BIO - GOV - LIT")
  if (subjectTokens.length === 0) {
    if (raw.includes('/') || raw.includes('|') || raw.includes('+')) {
      const parts = raw.split(/[/|+]/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        subjectTokens = parts;
      }
    } else if (raw.includes(',')) {
      const parts = raw.split(',').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        subjectTokens = parts;
      }
    } else if (raw.includes(' - ')) {
      const parts = raw.split(' - ').map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        subjectTokens = parts;
      }
    }
  }

  const codeCandidates = new Set<string>();
  if (codeWithoutBrackets) {
    codeCandidates.add(codeWithoutBrackets.toLowerCase());
    const noJupeb = codeWithoutBrackets.replace(/^jupeb[\s_-]*/i, '').trim();
    if (noJupeb) {
      codeCandidates.add(noJupeb.toLowerCase());
      codeCandidates.add(noJupeb.replace(/[\s_-]+/g, '').toLowerCase());
    }
    if (!/^jupeb/i.test(codeWithoutBrackets)) {
      codeCandidates.add(`jupeb ${codeWithoutBrackets}`.toLowerCase());
      codeCandidates.add(`jupeb-${codeWithoutBrackets}`.toLowerCase());
    }
  }

  return {
    raw,
    codePart: codeWithoutBrackets,
    codeCandidates: Array.from(codeCandidates),
    subjectTokens,
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
    private readonly scopeService: InstitutionUserScopeService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async bulkUpload(
    fileBuffer: Buffer,
    sessionId: string,
    universityId: string,
    userId?: string | null,
  ): Promise<BulkRegistrationResult> {
    if (userId) {
      const scoped = await this.scopeService.effectiveUniversityId(userId, universityId);
      if (scoped) universityId = scoped;
    }
    if (!universityId) {
      throw new UnprocessableEntityException('university_id is required');
    }

    const universityRows = await this.dataSource.query(
      `SELECT jupeb_prefix FROM jupeb_universities WHERE id = $1 LIMIT 1`,
      [universityId],
    );
    const jupebPrefix = universityRows[0]?.jupeb_prefix || '';
    const codeExpiresAt = institutionCodeExpiresAt();

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

    // 1. Preload all active subjects for code & name lookup
    const allSubjects: { id: string; code: string; name: string }[] = await this.dataSource.query(
      `SELECT id, code, name FROM jupeb_subjects WHERE deleted_at IS NULL ORDER BY code ASC`,
    );

    const subjectByCode = new Map<string, { id: string; code: string; name: string }>();
    const subjectByName = new Map<string, { id: string; code: string; name: string }>();

    for (const sub of allSubjects) {
      const normCode = normalizeSubjectToken(sub.code);
      const normName = normalizeSubjectToken(sub.name);
      if (normCode) subjectByCode.set(normCode, sub);
      if (normName) subjectByName.set(normName, sub);
    }

    const resolveSingleSubject = async (
      token: string,
    ): Promise<{ id: string; code: string; name: string } | null> => {
      if (!token) return null;
      const cleanToken = normalizeSubjectToken(token);
      if (!cleanToken) return null;

      if (subjectByCode.has(cleanToken)) return subjectByCode.get(cleanToken)!;
      if (subjectByName.has(cleanToken)) return subjectByName.get(cleanToken)!;

      const aliasCode = KNOWN_SUBJECT_ALIASES[cleanToken];
      if (aliasCode && subjectByCode.has(aliasCode)) {
        return subjectByCode.get(aliasCode)!;
      }

      // Fuzzy match by code prefix or name includes
      for (const sub of allSubjects) {
        const c = normalizeSubjectToken(sub.code);
        const n = normalizeSubjectToken(sub.name);
        if (c === cleanToken || n === cleanToken) return sub;
        if (cleanToken.length >= 3 && (c.startsWith(cleanToken) || cleanToken.startsWith(c))) {
          return sub;
        }
        if (cleanToken.length >= 4 && (n.includes(cleanToken) || cleanToken.includes(n))) {
          return sub;
        }
      }

      // Auto-provision standard JUPEB subject if not present in DB
      const stdSub = STANDARD_JUPEB_SUBJECTS[cleanToken] || (aliasCode ? STANDARD_JUPEB_SUBJECTS[aliasCode] : null);
      if (stdSub) {
        try {
          const insertRes = await this.dataSource.query(
            `INSERT INTO jupeb_subjects (code, name, status, created_at, updated_at)
             VALUES ($1, $2, 'active', NOW(), NOW())
             RETURNING id, code, name`,
            [stdSub.code, stdSub.name],
          );
          if (insertRes[0]) {
            const sub = insertRes[0];
            allSubjects.push(sub);
            subjectByCode.set(normalizeSubjectToken(sub.code), sub);
            subjectByName.set(normalizeSubjectToken(sub.name), sub);
            return sub;
          }
        } catch {
          // If already exists or concurrent insertion, query it
          const existing = await this.dataSource.query(
            `SELECT id, code, name FROM jupeb_subjects WHERE code = $1 LIMIT 1`,
            [stdSub.code],
          );
          if (existing[0]) {
            const sub = existing[0];
            allSubjects.push(sub);
            subjectByCode.set(normalizeSubjectToken(sub.code), sub);
            subjectByName.set(normalizeSubjectToken(sub.name), sub);
            return sub;
          }
        }
      }

      return null;
    };

    // 2. Preload active combinations with items for matching
    const activeCombos: any[] = await this.dataSource.query(
      `SELECT sc.id, sc.code, sc.title, sc.is_global, sc.university_id,
              COALESCE(ARRAY_AGG(s.id ORDER BY sci.position) FILTER (WHERE s.id IS NOT NULL), '{}') as subject_ids,
              COALESCE(ARRAY_AGG(s.code ORDER BY sci.position) FILTER (WHERE s.code IS NOT NULL), '{}') as subject_codes,
              COALESCE(ARRAY_AGG(s.name ORDER BY sci.position) FILTER (WHERE s.name IS NOT NULL), '{}') as subject_names
       FROM jupeb_subject_combinations sc
       LEFT JOIN jupeb_subject_combination_items sci ON sci.combination_id = sc.id
       LEFT JOIN jupeb_subjects s ON s.id = sci.subject_id
       WHERE sc.deleted_at IS NULL AND (sc.status = 'active' OR sc.status IS NULL)
         AND (sc.is_global = true OR sc.university_id = $1 OR sc.university_id IS NULL)
       GROUP BY sc.id, sc.code, sc.title, sc.is_global, sc.university_id`,
      [universityId],
    );

    const comboList = activeCombos.map((combo) => {
      const subjectCodes: string[] = (combo.subject_codes || []).map((c: string) => String(c).trim().toUpperCase());
      const subjectIds: string[] = (combo.subject_ids || []).map((id: string) => String(id).trim());
      const sortedSubjectCodes = [...subjectCodes].sort().join(',');
      const sortedSubjectIds = [...subjectIds].sort().join(',');
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
        subjectIds,
        sortedSubjectCodes,
        sortedSubjectIds,
        codeVariants,
      };
    });

    const resolveCombo = async (rawCode?: string) => {
      if (!rawCode || !String(rawCode).trim()) return null;
      const parsed = parseCombinationInput(rawCode);

      // A. If subject tokens (e.g. "BIO", "GOV", "LIT") are present in the dropdown/sheet:
      if (parsed.subjectTokens.length > 0) {
        const resolvedSubs: { id: string; code: string; name: string }[] = [];
        for (const t of parsed.subjectTokens) {
          const sub = await resolveSingleSubject(t);
          if (sub) resolvedSubs.push(sub);
        }

        if (resolvedSubs.length >= 2) {
          const targetIds = resolvedSubs.map((s) => s.id);
          const sortedTargetIds = [...targetIds].sort().join(',');
          const targetCodes = resolvedSubs.map((s) => s.code.toUpperCase());
          const sortedTargetCodes = [...targetCodes].sort().join(',');

          // 1. Check existing combinations with exact subject matches
          for (const c of comboList) {
            if (
              c.sortedSubjectIds === sortedTargetIds ||
              c.sortedSubjectCodes === sortedTargetCodes ||
              (c.subjectCodes.length === targetCodes.length &&
                targetCodes.every((tc: string) => c.subjectCodes.includes(tc)))
            ) {
              return c;
            }
          }

          // 2. If all subjects are valid active subjects but combination record doesn't exist yet, auto-create it
          if (resolvedSubs.length >= 3) {
            try {
              const comboCode = `SC-${targetCodes.join('-')}`.slice(0, 40);
              const comboTitle = targetCodes.join(' / ');
              const insertRes = await this.dataSource.query(
                `INSERT INTO jupeb_subject_combinations (code, title, status, is_global, university_id, created_at, updated_at)
                 VALUES ($1, $2, 'active', false, $3, NOW(), NOW())
                 RETURNING id, code, title, is_global, university_id`,
                [comboCode, comboTitle, universityId],
              );
              const newCombo = insertRes[0];
              for (let pos = 0; pos < resolvedSubs.length; pos++) {
                await this.dataSource.query(
                  `INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position, created_at)
                   VALUES ($1, $2, $3, NOW()) ON CONFLICT DO NOTHING`,
                  [newCombo.id, resolvedSubs[pos].id, pos + 1],
                );
              }
              const createdComboObj = {
                ...newCombo,
                subjectCodes: targetCodes,
                subjectIds: targetIds,
                sortedSubjectCodes: sortedTargetCodes,
                sortedSubjectIds: sortedTargetIds,
                codeVariants: new Set<string>([
                  comboCode.toLowerCase(),
                  comboCode.replace(/[\s_-]+/g, '').toLowerCase(),
                ]),
              };
              comboList.push(createdComboObj);
              return createdComboObj;
            } catch {
              // Ignore unique constraint conflict and fallback
            }
          }
        }
      }

      // B. Match by code & code variants (e.g. "SC-001", "JUPEB-SC-001")
      if (parsed.codeCandidates.length > 0) {
        for (const c of comboList) {
          if (parsed.codeCandidates.some((cand) => c.codeVariants.has(cand))) {
            return c;
          }
        }
      }

      // C. Match by title
      if (parsed.raw) {
        const lowRaw = parsed.raw.toLowerCase();
        for (const c of comboList) {
          if (c.title && (c.title.toLowerCase() === lowRaw || c.title.toLowerCase().includes(lowRaw))) {
            return c;
          }
        }
      }

      // D. Match by UUID directly
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(parsed.raw)) {
        for (const c of comboList) {
          if (c.id.toLowerCase() === parsed.raw.toLowerCase()) {
            return c;
          }
        }
      }

      return null;
    };

    const errors: BulkRegistrationError[] = [];
    const registrations: RegistrationEntity[] = [];
    let successful = 0;
    let validRowsCount = 0;

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

      // Skip completely blank rows (e.g. empty template rows with default dropdown values)
      if (!rawNin && !firstName && !lastName && !email && !phone) {
        continue;
      }
      validRowsCount += 1;

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

      const matchedCombo = await resolveCombo(rawCombo);
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
        const candidateCode = formatProvisionalCandidateCode(jupebPrefix, currentSerial);
        const institutionIssuedCode = await generateUniqueInstitutionCode(this.dataSource);

        const registration = this.registrationRepo.create({
          sessionId,
          universityId,
          ninVerificationId: ninVerification.id,
          subjectCombinationId: matchedCombo?.id || null,
          institutionIssuedCode,
          institutionCodeExpiresAt: codeExpiresAt,
          provisionalSerial: currentSerial,
          provisionalCandidateCode: candidateCode,
          status: RegistrationStatus.CODE_ISSUED,
          createdBy: userId || null,
        });

        const savedRegistration = await this.registrationRepo.save(registration);

        registrations.push(savedRegistration);
        successful += 1;

        // Notify the candidate (email) and push an instant CRMS/Attendance sync.
        this.eventEmitter.emit(RegistrationEvent.CODE_ISSUED, {
          registrationId: savedRegistration.id,
          userId,
        });
        this.eventEmitter.emit(SyncEvent.CANDIDATE_UPDATED, {
          registrationId: savedRegistration.id,
          userId,
          data: { status: RegistrationStatus.CODE_ISSUED },
        });
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
          error:
            (err?.code || err?.driverError?.code) === '23505'
              ? 'Duplicate NIN registration for this session and university'
              : err.message || 'Failed to register candidate',
        });
      }
    }

    const failed = errors.length;
    const totalRowsCount = validRowsCount || rows.length;
    const resultData = {
      total_rows: totalRowsCount,
      totalRows: totalRowsCount,
      successful,
      succeeded_count: successful,
      succeededCount: successful,
      failed,
      failed_count: failed,
      failedCount: failed,
      errors,
      registrations,
    };

    return {
      success: failed === 0 || successful > 0,
      total_rows: totalRowsCount,
      totalRows: totalRowsCount,
      successful,
      succeeded_count: successful,
      succeededCount: successful,
      failed,
      failed_count: failed,
      failedCount: failed,
      errors,
      registrations,
      data: resultData,
    } as any;
  }
}
