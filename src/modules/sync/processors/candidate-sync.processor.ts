import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { CandidateSyncJobPayload } from '../dto/enqueue-candidate-sync.dto';
import { SyncLogEntity, SyncStatus } from '../entities/sync-log.entity';
import * as attendanceProvider from '../../../integrations/attendance';
import * as crmsProvider from '../../../integrations/crms';

const CONTEXT = 'CandidateSyncProcessor';

@Processor(SYNC_QUEUES.CANDIDATE_SYNC)
export class CandidateSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
  ) {
    super();
  }

  async process(job: Job<CandidateSyncJobPayload & { syncLogId?: string }>): Promise<any> {
    const { sessionId, registrationIds, syncLogId } = job.data;
    this.logger.log(`Processing candidate sync job ${job.id} for session ${sessionId}`);

    if (syncLogId) {
      await this.syncLogRepo.update(syncLogId, {
        status: SyncStatus.IN_PROGRESS,
        attemptCount: job.attemptsMade + 1,
      } as any);
    }

    try {
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
        if (syncLogId) {
          await this.syncLogRepo.update(syncLogId, {
            status: SyncStatus.COMPLETED,
            completedAt: new Date(),
            responsePayload: { synced: 0, reason: 'no_approved_candidates' },
          } as any);
        }
        return { synced: 0 };
      }

      this.logger.log(`Found ${targetIds.length} candidates to sync`);

      // Fetch session info
      let session: any = null;
      if (sessionId) {
        const sessionRows = await this.dataSource.query(
          `SELECT * FROM jupeb_registration_sessions WHERE id = $1 LIMIT 1`,
          [sessionId],
        );
        session = sessionRows[0] || null;
      }

      const chunkSize = 100;
      let attendanceSuccess = 0;
      let crmsSuccess = 0;
      const errors: string[] = [];

      for (let i = 0; i < targetIds.length; i += chunkSize) {
        const chunk = targetIds.slice(i, i + chunkSize);

        // 1. Sync to Attendance
        try {
          const attendancePayloads = await this.getStudentSyncPayloads(chunk);
          const validAttendancePayloads = attendancePayloads.filter((p: any) => {
            if (!Array.isArray(p.subjects) || p.subjects.length !== 3) {
              const reason = !Array.isArray(p.subjects)
                ? 'subjects is missing or not an array'
                : `expected exactly 3 subjects, got ${p.subjects.length}`;
              this.logger.warn(
                `[AttendanceSync] Skipping candidate ${p.jupebNumber || p.registration_id} from Attendance sync: ${reason}`,
              );
              return false;
            }
            return true;
          });

          const skippedCount = attendancePayloads.length - validAttendancePayloads.length;
          if (skippedCount > 0) {
            errors.push(
              `[AttendanceSync] ${skippedCount} candidate(s) skipped due to missing or invalid subject combinations (Attendance requires exactly 3 subjects)`,
            );
          }

          if (validAttendancePayloads.length > 0) {
            const provider = attendanceProvider.get();
            if (typeof provider.syncStudents === 'function') {
              const response = await provider.syncStudents({ students: validAttendancePayloads });
              this.logger.log(
                `[AttendanceSync] Chunk ${i / chunkSize + 1} synced successfully (${validAttendancePayloads.length} students)`,
              );

              // Update registration records with returned attendance registrationCode and student_id
              if (response && response.results && Array.isArray(response.results)) {
                for (const res of response.results) {
                  if (res.registrationCode && res.student_id) {
                    const payloadItem = validAttendancePayloads.find(
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
              attendanceSuccess += validAttendancePayloads.length;
            }
          }
        } catch (attErr: any) {
          const detail = attErr.details?.upstream || attErr.details || attErr.message;
          const errMsg = `[AttendanceSync] Chunk error: ${attErr.message}${detail && typeof detail === 'string' ? ` - ${detail}` : ''}`;
          this.logger.warn(errMsg, attErr.stack || attErr);
          errors.push(errMsg);
        }

        // 2. Sync to CRMS
        try {
          const crmsPayloads = await this.getCrmsCandidateSyncPayloads(chunk, session);
          if (crmsPayloads.length > 0) {
            const provider = crmsProvider.get();
            if (typeof provider.syncCandidates === 'function') {
              await provider.syncCandidates(crmsPayloads);
              this.logger.log(
                `[CrmsSync] Chunk ${i / chunkSize + 1} synced successfully (${crmsPayloads.length} candidates)`,
              );
              crmsSuccess += crmsPayloads.length;
            }
          }
        } catch (crmsErr: any) {
          const detail = crmsErr.details?.upstream || crmsErr.details || crmsErr.message;
          const errMsg = `[CrmsSync] Chunk error: ${crmsErr.message}${detail && typeof detail === 'string' ? ` - ${detail}` : ''}`;
          this.logger.warn(errMsg, crmsErr.stack || crmsErr);
          errors.push(errMsg);
        }
      }

      const isPartial = errors.length > 0 && (attendanceSuccess > 0 || crmsSuccess > 0);
      const isFailed = errors.length > 0 && attendanceSuccess === 0 && crmsSuccess === 0;
      const status = isFailed ? SyncStatus.FAILED : isPartial ? SyncStatus.PARTIAL : SyncStatus.COMPLETED;

      const result = {
        totalCandidates: targetIds.length,
        attendanceSynced: attendanceSuccess,
        crmsSynced: crmsSuccess,
        errors: errors.length > 0 ? errors : undefined,
      };

      if (syncLogId) {
        await this.syncLogRepo.update(syncLogId, {
          status,
          completedAt: new Date(),
          responsePayload: result,
          errorMessage: errors.length > 0 ? errors.join('\n') : null,
        } as any);
      }

      return result;
    } catch (error: any) {
      this.logger.error(`Failed processing candidate sync job ${job.id}: ${error.message}`, error.stack);
      if (syncLogId) {
        await this.syncLogRepo.update(syncLogId, {
          status: SyncStatus.FAILED,
          errorMessage: error.message,
          errorDetails: { stack: error.stack },
        } as any);
      }
      throw error;
    }
  }

  private async getStudentSyncPayloads(registrationIds: string[]) {
    const query = `
      SELECT
        r.id AS "registration_id",
        COALESCE(r.jupeb_candidate_number, r.provisional_candidate_code, r.institution_issued_code) AS "jupebNumber",
        p.first_name AS "firstName",
        p.last_name AS "lastName",
        u.email AS "email",
        COALESCE(uni.jupeb_prefix, uni.code, '') AS "institutionCode",
        'STUDENT' AS "role",
        UPPER(COALESCE(p.gender, '')) AS "gender",
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
      LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
      WHERE r.id = ANY($1::uuid[])
    `;
    return this.dataSource.query(query, [registrationIds]);
  }

  private async getCrmsCandidateSyncPayloads(registrationIds: string[], session: any) {
    const query = `
      SELECT
        r.id AS "registration_id",
        COALESCE(r.jupeb_candidate_number, r.provisional_candidate_code, r.institution_issued_code) AS "candidateNumber",
        p.first_name AS "firstName",
        p.last_name AS "lastName",
        COALESCE(nv.response_payload->>'middle_name', nv.response_payload->>'middlename', nv.response_payload->>'middleName') AS "middleName",
        COALESCE(uni.jupeb_prefix, uni.code, '') AS "institutionCode",
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
      LEFT JOIN jupeb_universities uni ON uni.id = r.university_id
      LEFT JOIN jupeb_registration_sessions s ON s.id = r.session_id
      LEFT JOIN jupeb_nin_verifications nv ON nv.id = r.nin_verification_id
      WHERE r.id = ANY($1::uuid[])
    `;
    const rows = await this.dataSource.query(query, [registrationIds]);

    return rows.map((row: any) => {
      let academicYear = '';
      if (row.candidateNumber && /^\d{2}/.test(row.candidateNumber)) {
        academicYear = `20${row.candidateNumber.slice(0, 2)}`;
      } else if (row.sessionYearShort || session?.year_short) {
        academicYear = `20${row.sessionYearShort || session.year_short}`;
      } else if (row.sessionAcademicYear || session?.academic_year) {
        const rawYear = String(row.sessionAcademicYear || session?.academic_year);
        academicYear = rawYear.split('/')[0].trim();
      }

      return {
        candidateNumber: row.candidateNumber,
        jupebNumber: row.candidateNumber,
        firstName: row.firstName || '',
        lastName: row.lastName || '',
        middleName: row.middleName || undefined,
        institutionCode: row.institutionCode || '',
        academicYear,
        subjects: Array.isArray(row.subjects) ? row.subjects : [],
      };
    });
  }
}
