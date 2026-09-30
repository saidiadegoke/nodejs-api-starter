import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { DataSource, In, Repository } from 'typeorm';
import { SYNC_QUEUES } from '../../../infra/bullmq/queues.config';
import { InstitutionSyncJobPayload } from '../dto/enqueue-institution-sync.dto';
import { SyncLogEntity, SyncStatus } from '../entities/sync-log.entity';
import { UniversityEntity } from '../../institutions/entities/university.entity';
import * as attendanceProvider from '../../../integrations/attendance';
import * as crmsProvider from '../../../integrations/crms';

const CONTEXT = 'InstitutionSyncProcessor';

@Processor(SYNC_QUEUES.INSTITUTION_SYNC)
export class InstitutionSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(CONTEXT);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(SyncLogEntity)
    private readonly syncLogRepo: Repository<SyncLogEntity>,
    @InjectRepository(UniversityEntity)
    private readonly universityRepo: Repository<UniversityEntity>,
  ) {
    super();
  }

  async process(job: Job<InstitutionSyncJobPayload>): Promise<any> {
    const { universityIds, syncAll, syncLogId } = job.data;
    this.logger.log(`Processing institution sync job ${job.id}`);

    if (syncLogId) {
      await this.syncLogRepo.update(syncLogId, {
        status: SyncStatus.IN_PROGRESS,
        attemptCount: job.attemptsMade + 1,
      } as any);
    }

    try {
      let universities: UniversityEntity[];
      if (universityIds && universityIds.length > 0 && !syncAll) {
        universities = await this.universityRepo.find({
          where: { id: In(universityIds) },
        });
      } else {
        universities = await this.universityRepo.find({
          where: { status: 'active' },
          order: { name: 'ASC' },
        });
      }

      if (!universities || universities.length === 0) {
        this.logger.log('No universities found to sync');
        if (syncLogId) {
          await this.syncLogRepo.update(syncLogId, {
            status: SyncStatus.COMPLETED,
            completedAt: new Date(),
            responsePayload: { synced: 0, reason: 'no_universities_found' },
          } as any);
        }
        return { synced: 0 };
      }

      this.logger.log(`Syncing ${universities.length} universities to Attendance and CRMS`);

      let attendanceSuccess = false;
      let crmsSuccess = false;
      const errors: string[] = [];

      // 1. Sync to Attendance
      try {
        const attPayload = {
          institutions: universities.map((u) => ({
            institutionCode: u.jupebPrefix || u.code,
            institutionName: u.name,
            address: u.address || 'Nigeria',
            coordinates: {
              latitude: 6.4518847,
              longitude: 3.33262,
            },
            lectureRadius: 100,
          })),
        };

        const att = attendanceProvider.get();
        if (typeof att.syncInstitutions === 'function') {
          await att.syncInstitutions(attPayload);
          attendanceSuccess = true;
          this.logger.log(`[AttendanceSync] ${universities.length} institutions synced successfully`);
        }
      } catch (attErr: any) {
        const errMsg = `[AttendanceSync] Institutions sync error: ${attErr.message}`;
        this.logger.error(errMsg, attErr.stack);
        errors.push(errMsg);
      }

      // 2. Sync to CRMS
      try {
        const crmsPayload = universities.map((u) => {
          const category = u.universityType
            ? u.universityType.charAt(0).toUpperCase() + u.universityType.slice(1).toLowerCase()
            : null;
          return {
            code: u.jupebPrefix || u.code,
            name: u.name,
            shortCode: u.shortName || u.code,
            category,
            state: u.metadata?.state || null,
          };
        });

        const crms = crmsProvider.get();
        if (typeof crms.syncInstitutions === 'function') {
          await crms.syncInstitutions(crmsPayload);
          crmsSuccess = true;
          this.logger.log(`[CrmsSync] ${universities.length} institutions synced successfully`);
        }
      } catch (crmsErr: any) {
        const errMsg = `[CrmsSync] Institutions sync error: ${crmsErr.message}`;
        this.logger.error(errMsg, crmsErr.stack);
        errors.push(errMsg);
      }

      const isPartial = errors.length > 0 && (attendanceSuccess || crmsSuccess);
      const isFailed = errors.length > 0 && !attendanceSuccess && !crmsSuccess;
      const status = isFailed ? SyncStatus.FAILED : isPartial ? SyncStatus.PARTIAL : SyncStatus.COMPLETED;

      const result = {
        totalInstitutions: universities.length,
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
      this.logger.error(`Failed processing institution sync job ${job.id}: ${error.message}`, error.stack);
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
