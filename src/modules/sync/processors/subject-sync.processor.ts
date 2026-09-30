import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { SubjectSyncJobPayload } from '../dto/enqueue-subject-sync.dto';
import { SyncLogEntity, SyncStatus } from '../entities/sync-log.entity';
import { SubjectEntity } from '../../subjects/entities/subject.entity';
import * as attendanceProvider from '../../../integrations/attendance';
import * as crmsProvider from '../../../integrations/crms';

const CONTEXT = 'SubjectSyncProcessor';

@Processor(SYNC_QUEUES.SUBJECT_SYNC)
export class SubjectSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
    @InjectRepository(SubjectEntity)
    private readonly subjectRepo: Repository<SubjectEntity>,
  ) {
    super();
  }

  async process(job: Job<SubjectSyncJobPayload>): Promise<any> {
    const { subjectIds, syncAll, syncLogId } = job.data;
    this.logger.log(`Processing subject sync job ${job.id}`);

    if (syncLogId) {
      await this.syncLogRepo.update(syncLogId, {
        status: SyncStatus.IN_PROGRESS,
        attemptCount: job.attemptsMade + 1,
      } as any);
    }

    try {
      let subjects: SubjectEntity[];
      if (subjectIds && subjectIds.length > 0 && !syncAll) {
        subjects = await this.subjectRepo.find({
          where: { id: In(subjectIds) },
        });
      } else {
        subjects = await this.subjectRepo.find({
          where: { status: 'active' },
          order: { name: 'ASC' },
        });
      }

      if (!subjects || subjects.length === 0) {
        this.logger.log('No subjects found to sync');
        if (syncLogId) {
          await this.syncLogRepo.update(syncLogId, {
            status: SyncStatus.COMPLETED,
            completedAt: new Date(),
            responsePayload: { synced: 0, reason: 'no_subjects_found' },
          } as any);
        }
        return { synced: 0 };
      }

      this.logger.log(`Syncing ${subjects.length} subjects to Attendance and CRMS`);

      const payload = subjects.map((s) => ({
        code: s.code,
        name: s.name,
        description: s.description || '',
        status: s.status,
      }));

      let attendanceSuccess = false;
      let crmsSuccess = false;
      const errors: string[] = [];

      // 1. Sync to Attendance
      try {
        const att = attendanceProvider.get();
        if (typeof att.syncSubjects === 'function') {
          await att.syncSubjects(payload);
          attendanceSuccess = true;
          this.logger.log(`[AttendanceSync] ${subjects.length} subjects synced successfully`);
        }
      } catch (attErr: any) {
        const errMsg = `[AttendanceSync] Subjects sync error: ${attErr.message}`;
        this.logger.error(errMsg, attErr.stack);
        errors.push(errMsg);
      }

      // 2. Sync to CRMS
      try {
        const crms = crmsProvider.get();
        if (typeof crms.syncSubjects === 'function') {
          await crms.syncSubjects(payload);
          crmsSuccess = true;
          this.logger.log(`[CrmsSync] ${subjects.length} subjects synced successfully`);
        }
      } catch (crmsErr: any) {
        const errMsg = `[CrmsSync] Subjects sync error: ${crmsErr.message}`;
        this.logger.error(errMsg, crmsErr.stack);
        errors.push(errMsg);
      }

      const isPartial = errors.length > 0 && (attendanceSuccess || crmsSuccess);
      const isFailed = errors.length > 0 && !attendanceSuccess && !crmsSuccess;
      const status = isFailed ? SyncStatus.FAILED : isPartial ? SyncStatus.PARTIAL : SyncStatus.COMPLETED;

      const result = {
        totalSubjects: subjects.length,
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
      this.logger.error(`Failed processing subject sync job ${job.id}: ${error.message}`, error.stack);
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
}
