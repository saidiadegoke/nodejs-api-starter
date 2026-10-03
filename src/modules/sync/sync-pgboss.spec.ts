import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { PgBossService } from '../../infra/pg-boss/pg-boss.service';
import { SyncExecutorService } from './services/sync-executor.service';
import { CandidateSyncQueueService } from './services/candidate-sync-queue.service';
import { SubjectSyncQueueService } from './services/subject-sync-queue.service';
import { InstitutionSyncQueueService } from './services/institution-sync-queue.service';
import { PgBossSyncWorkerService } from './services/pgboss-sync-worker.service';
import { SyncLogEntity } from './entities/sync-log.entity';

describe('PgBoss Sync Queues and Workers', () => {
  let candidateQueue: CandidateSyncQueueService;
  let subjectQueue: SubjectSyncQueueService;
  let institutionQueue: InstitutionSyncQueueService;
  let workerService: PgBossSyncWorkerService;
  let pgBossService: jest.Mocked<Partial<PgBossService>>;
  let syncExecutor: jest.Mocked<Partial<SyncExecutorService>>;
  let mockSyncLogRepo: any;

  beforeEach(async () => {
    pgBossService = {
      send: jest.fn().mockResolvedValue('job-uuid-123'),
      work: jest.fn().mockImplementation(async (queueName) => {
        return `worker-${queueName}`;
      }),
    };

    syncExecutor = {
      syncCandidates: jest.fn().mockResolvedValue({ totalCandidates: 10, attendanceSynced: 10, crmsSynced: 10 }),
      syncSubjects: jest.fn().mockResolvedValue({ totalSubjects: 5, attendanceSynced: true, crmsSynced: true }),
      syncInstitutions: jest.fn().mockResolvedValue({ totalInstitutions: 2, attendanceSynced: true, crmsSynced: true }),
    };

    mockSyncLogRepo = {
      create: jest.fn().mockImplementation((dto) => ({ id: 'log-123', ...dto })),
      save: jest.fn().mockImplementation(async (entity) => ({ id: 'log-123', ...entity })),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CandidateSyncQueueService,
        SubjectSyncQueueService,
        InstitutionSyncQueueService,
        PgBossSyncWorkerService,
        {
          provide: PgBossService,
          useValue: pgBossService,
        },
        {
          provide: SyncExecutorService,
          useValue: syncExecutor,
        },
        {
          provide: getRepositoryToken(SyncLogEntity),
          useValue: mockSyncLogRepo,
        },
      ],
    }).compile();

    candidateQueue = module.get<CandidateSyncQueueService>(CandidateSyncQueueService);
    subjectQueue = module.get<SubjectSyncQueueService>(SubjectSyncQueueService);
    institutionQueue = module.get<InstitutionSyncQueueService>(InstitutionSyncQueueService);
    workerService = module.get<PgBossSyncWorkerService>(PgBossSyncWorkerService);
  });

  describe('CandidateSyncQueueService', () => {
    it('should enqueue candidate sync job to pg-boss and update sync log with jobId', async () => {
      const res = await candidateQueue.enqueueCandidateSyncJob({
        sessionId: 'session-123',
        registrationIds: ['reg-1', 'reg-2'],
        userId: 'admin-user',
        triggeredBy: 'finalize_candidate_numbers',
      });

      expect(mockSyncLogRepo.create).toHaveBeenCalled();
      expect(mockSyncLogRepo.save).toHaveBeenCalled();
      expect(pgBossService.send).toHaveBeenCalledWith(
        'candidate-sync',
        expect.objectContaining({
          sessionId: 'session-123',
          registrationIds: ['reg-1', 'reg-2'],
          syncLogId: 'log-123',
        }),
        expect.objectContaining({
          retryLimit: 5,
        }),
      );
      expect(mockSyncLogRepo.update).toHaveBeenCalledWith('log-123', { jobId: 'job-uuid-123' });
      expect(res.jobId).toBe('job-uuid-123');
      expect(res.status).toBe('enqueued');
    });
  });

  describe('SubjectSyncQueueService', () => {
    it('should enqueue subject sync job to pg-boss', async () => {
      const res = await subjectQueue.enqueueSubjectSyncJob({
        subjectIds: ['sub-1'],
        syncAll: false,
        triggeredBy: 'manual_api_trigger',
      });

      expect(pgBossService.send).toHaveBeenCalledWith(
        'subject-sync',
        expect.objectContaining({
          subjectIds: ['sub-1'],
          syncLogId: 'log-123',
        }),
        expect.any(Object),
      );
      expect(res.status).toBe('enqueued');
    });
  });

  describe('InstitutionSyncQueueService', () => {
    it('should enqueue institution sync job to pg-boss', async () => {
      const res = await institutionQueue.enqueueInstitutionSyncJob({
        universityIds: ['uni-1'],
        syncAll: false,
        triggeredBy: 'manual_api_trigger',
      });

      expect(pgBossService.send).toHaveBeenCalledWith(
        'institution-sync',
        expect.objectContaining({
          universityIds: ['uni-1'],
          syncLogId: 'log-123',
        }),
        expect.any(Object),
      );
      expect(res.status).toBe('enqueued');
    });
  });

  describe('PgBossSyncWorkerService', () => {
    it('should register workers for all queues on module init', async () => {
      await workerService.onModuleInit();

      expect(pgBossService.work).toHaveBeenCalledWith('candidate-sync', expect.any(Function));
      expect(pgBossService.work).toHaveBeenCalledWith('subject-sync', expect.any(Function));
      expect(pgBossService.work).toHaveBeenCalledWith('institution-sync', expect.any(Function));
    });
  });
});
