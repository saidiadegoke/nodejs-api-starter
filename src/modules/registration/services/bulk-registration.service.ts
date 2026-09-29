import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as XLSX from 'xlsx';
import { normalizeNin, hashNin, ninLast4 } from '../../identity/utils/identity-crypto.util';

export interface BulkRegistrationResult {
  total_rows: number;
  successful: number;
  failed: number;
  errors: { row: number; error: string }[];
  registrations: any[];
}

@Injectable()
export class BulkRegistrationService {
  constructor(private readonly dataSource: DataSource) {}

  async bulkUpload(
    fileBuffer: Buffer,
    sessionId: string,
    universityId: string,
    userId?: string | null,
  ): Promise<BulkRegistrationResult> {
    if (!fileBuffer || !fileBuffer.length) {
      throw new UnprocessableEntityException('No file buffer uploaded');
    }

    const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet);

    const errors: { row: number; error: string }[] = [];
    const registrations: any[] = [];
    let successful = 0;

    for (let idx = 0; idx < rows.length; idx += 1) {
      const row = rows[idx];
      const rowNumber = idx + 2;

      const rawNin = row.nin || row.NIN || row.Nin;
      const normNin = normalizeNin(rawNin);

      if (normNin.length !== 11) {
        errors.push({ row: rowNumber, error: 'Invalid 11-digit NIN' });
        continue;
      }

      try {
        const hashed = hashNin(normNin);
        const last4 = ninLast4(normNin);

        // Insert or find NIN verification
        let ninVerId: string;
        const existingNin = await this.dataSource.query(
          `SELECT id FROM jupeb_nin_verifications WHERE nin_hash = $1 LIMIT 1`,
          [hashed],
        );

        if (existingNin.length) {
          ninVerId = existingNin[0].id;
        } else {
          const insertNin = await this.dataSource.query(
            `INSERT INTO jupeb_nin_verifications (
              nin_hash, nin_last4, provider, status, response_payload, error_payload, requested_by
            ) VALUES ($1, $2, 'bulk_upload', 'verified', '{}'::jsonb, '{}'::jsonb, $3)
            RETURNING id`,
            [hashed, last4, userId || null],
          );
          ninVerId = insertNin[0].id;
        }

        // Generate serial and code
        const serialRows = await this.dataSource.query(
          `SELECT COALESCE(MAX(provisional_serial), 0) + 1 AS next_serial
           FROM jupeb_registrations WHERE session_id = $1`,
          [sessionId],
        );
        const nextSerial = serialRows[0].next_serial;
        const code = String(1000000 + nextSerial).slice(-7);

        const insertReg = await this.dataSource.query(
          `INSERT INTO jupeb_registrations (
            session_id, university_id, nin_verification_id, provisional_serial,
            provisional_candidate_code, status, created_by
          ) VALUES ($1, $2, $3, $4, $5, 'code_issued', $6)
          RETURNING *`,
          [sessionId, universityId, ninVerId, nextSerial, code, userId || null],
        );

        registrations.push(insertReg[0]);
        successful += 1;
      } catch (err: any) {
        errors.push({ row: rowNumber, error: err.message || 'Failed to register candidate' });
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
