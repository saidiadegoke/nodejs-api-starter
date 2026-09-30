import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { normalizeNin, hashNin, ninLast4 } from '../../identity/utils/identity-crypto.util';
import { RegistrationStatus } from '../../../shared/enums';
import { RegistrationEntity } from '../entities/registration.entity';
import { NinVerificationEntity, NinVerificationStatus } from '../../identity/entities/nin-verification.entity';

export interface BulkRegistrationError {
  row: number;
  error: string;
}

export interface BulkRegistrationResult {
  total_rows: number;
  successful: number;
  failed: number;
  errors: BulkRegistrationError[];
  registrations: RegistrationEntity[];
}

@Injectable()
export class BulkRegistrationService {
  constructor(
    @InjectRepository(RegistrationEntity)
    private readonly registrationRepo: Repository<RegistrationEntity>,
    @InjectRepository(NinVerificationEntity)
    private readonly ninVerificationRepo: Repository<NinVerificationEntity>,
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
    const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(sheet);

    if (!rows.length) {
      return {
        total_rows: 0,
        successful: 0,
        failed: 0,
        errors: [],
        registrations: [],
      };
    }

    const errors: BulkRegistrationError[] = [];
    const registrations: RegistrationEntity[] = [];
    let successful = 0;

    // Get the current max serial for the session using query builder
    const maxSerialRecord = await this.registrationRepo
      .createQueryBuilder('r')
      .select('COALESCE(MAX(r.provisional_serial), 0)', 'max_serial')
      .where('r.session_id = :sessionId', { sessionId })
      .getRawOne();

    let currentSerial = Number(maxSerialRecord?.max_serial || 0);

    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      const rowNumber = idx + 2;

      // Check common column aliases for NIN
      const rawNin =
        row.nin ??
        row.NIN ??
        row.Nin ??
        row.national_id ??
        row['National ID'] ??
        row['NIN Number'] ??
        row['nin_number'];

      const normNin = normalizeNin(rawNin);

      if (normNin.length !== 11) {
        errors.push({
          row: rowNumber,
          error: `Invalid 11-digit NIN: received "${rawNin ?? ''}"`,
        });
        continue;
      }

      try {
        const hashed = hashNin(normNin);
        const last4 = ninLast4(normNin);

        // Find or create NIN verification record via ORM
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
              responsePayload: {},
              errorPayload: {},
              requestedBy: userId || null,
            }),
          );
        }

        currentSerial += 1;
        const candidateCode = String(1000000 + currentSerial).slice(-7);

        // Create and save registration via ORM
        const registration = this.registrationRepo.create({
          sessionId,
          universityId,
          ninVerificationId: ninVerification.id,
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
