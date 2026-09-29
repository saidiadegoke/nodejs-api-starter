import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { DataSource } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { CandidateSyncJobPayload } from '../dto/enqueue-candidate-sync.dto';
import * as attendanceProvider from '../../../integrations/attendance';
import * as crmsProvider from '../../../integrations/crms';

const CONTEXT = 'CandidateSyncProcessor';

@Processor(SYNC_QUEUES.CANDIDATE_SYNC)
export class CandidateSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CONTEXT);

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  async process(job: Job<CandidateSyncJobPayload>): Promise<any> {
    const { sessionId, registrationIds } = job.data;
    this.logger.log(`Processing candidate sync job ${job.id} for session ${sessionId}`);

    let targetIds = registrationIds;
    if (!targetIds || targetIds.length === 0) {
      const rows = await this.dataSource.query(
        `SELECT id FROM jupeb_registrations WHERE session_id = $1 AND status = 'approved'`,
        [sessionId],
      );
      targetIds = rows.map((r: any) => r.id);
    }

    if (!targetIds || targetIds.length === 0) {
      this.logger.log(`No approved candidates found to sync for session ${sessionId}`);
      return { synced: 0 };
    }

    this.logger.log(`Found ${targetIds.length} approved candidates to sync for session ${sessionId}`);

    // Fetch session info
    const sessionRows = await this.dataSource.query(
      `SELECT * FROM jupeb_registration_sessions WHERE id = $1 LIMIT 1`,
      [sessionId],
    );
    const session = sessionRows[0] || null;

    const chunkSize = 100;
    let attendanceSuccess = 0;
    let crmsSuccess = 0;

    for (let i = 0; i < targetIds.length; i += chunkSize) {
      const chunk = targetIds.slice(i, i + chunkSize);

      // 1. Sync to Attendance
      try {
        const attendancePayloads = await this.getStudentSyncPayloads(chunk);
        if (attendancePayloads.length > 0) {
          const provider = attendanceProvider.get();
          if (typeof provider.syncStudents === 'function') {
            const response = await provider.syncStudents({ students: attendancePayloads });
            this.logger.log(
              `[AttendanceSync] Chunk ${i / chunkSize + 1} synced successfully for session ${sessionId}`,
            );

            // Update registration records with returned attendance registrationCode and student_id
            if (response && response.results && Array.isArray(response.results)) {
              for (const res of response.results) {
                if (res.registrationCode && res.student_id) {
                  const payloadItem = attendancePayloads.find(
                    (p: any) => p.jupebNumber === res.jupebNumber,
                  );
                  if (payloadItem && payloadItem.registration_id) {
                    await this.dataSource.query(
                      `UPDATE jupeb_registrations
                         SET attendance_registration_code = $2, attendance_student_id = $3, updated_at = NOW()
                       WHERE id = $1`,
                      [payloadItem.registration_id, res.registrationCode, res.student_id],
                    );
                  }
                }
              }
            }
            attendanceSuccess += attendancePayloads.length;
          }
        }
      } catch (attErr: any) {
        this.logger.error(`[AttendanceSync] Error syncing chunk: ${attErr.message}`, attErr.stack);
      }

      // 2. Sync to CRMS
      try {
        const crmsPayloads = await this.getCrmsCandidateSyncPayloads(chunk, session);
        if (crmsPayloads.length > 0) {
          const provider = crmsProvider.get();
          if (typeof provider.syncCandidates === 'function') {
            await provider.syncCandidates(crmsPayloads);
            this.logger.log(
              `[CrmsSync] Chunk ${i / chunkSize + 1} synced successfully for session ${sessionId}`,
            );
            crmsSuccess += crmsPayloads.length;
          }
        }
      } catch (crmsErr: any) {
        this.logger.error(`[CrmsSync] Error syncing chunk: ${crmsErr.message}`, crmsErr.stack);
      }
    }

    return {
      totalCandidates: targetIds.length,
      attendanceSynced: attendanceSuccess,
      crmsSynced: crmsSuccess,
    };
  }

  private async getStudentSyncPayloads(registrationIds: string[]) {
    const query = `
      SELECT
        r.id AS "registration_id",
        r.jupeb_candidate_number AS "jupebNumber",
        p.first_name AS "firstName",
        p.last_name AS "lastName",
        u.email AS "email",
        uni.jupeb_prefix AS "institutionCode",
        'STUDENT' AS "role",
        UPPER(p.gender) AS "gender",
        p.date_of_birth AS "dateOfBirth",
        u.phone AS "phone",
        p.residential_address AS "address",
        p.profile_photo_url AS "base64image",
        (
          SELECT array_agg(si.code)
          FROM jupeb_subject_combination_items sci
          JOIN jupeb_subjects si ON si.id = sci.subject_id
          WHERE sci.combination_id = r.subject_combination_id
        ) AS "subjects"
      FROM jupeb_registrations r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      JOIN jupeb_universities uni ON uni.id = r.university_id
      WHERE r.id = ANY($1::uuid[])
    `;
    return this.dataSource.query(query, [registrationIds]);
  }

  private async getCrmsCandidateSyncPayloads(registrationIds: string[], session: any) {
    const query = `
      SELECT
        r.id AS "registration_id",
        r.jupeb_candidate_number AS "candidateNumber",
        p.first_name AS "firstName",
        p.last_name AS "lastName",
        uni.jupeb_prefix AS "institutionCode",
        s.academic_year AS "sessionAcademicYear",
        s.year_short AS "sessionYearShort",
        (
          SELECT array_agg(si.code ORDER BY sci.position ASC)
          FROM jupeb_subject_combination_items sci
          JOIN jupeb_subjects si ON si.id = sci.subject_id
          WHERE sci.combination_id = r.subject_combination_id
        ) AS "subjects"
      FROM jupeb_registrations r
      JOIN users u ON u.id = r.user_id
      LEFT JOIN profiles p ON p.user_id = u.id
      JOIN jupeb_universities uni ON uni.id = r.university_id
      LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
      WHERE r.id = ANY($1::uuid[])
        AND r.jupeb_candidate_number IS NOT NULL
    `;
    const rows = await this.dataSource.query(query, [registrationIds]);

    return rows.map((row: any) => {
      let academicYear = '';
      const rawYear = row.sessionAcademicYear || session?.academic_year;
      if (rawYear) {
        academicYear = String(rawYear).split('/')[0].trim();
      } else if (row.sessionYearShort || session?.year_short) {
        academicYear = `20${row.sessionYearShort || session.year_short}`;
      } else if (row.candidateNumber && /^\d{2}/.test(row.candidateNumber)) {
        academicYear = `20${row.candidateNumber.slice(0, 2)}`;
      }

      return {
        candidateNumber: row.candidateNumber,
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        institutionCode: row.institutionCode || '',
        academicYear,
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
      };
    });
  }
}
