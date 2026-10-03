import { Test, TestingModule } from '@nestjs/testing';
import { SyncEventListener } from './listeners/sync-event.listener';
import { SyncExecutorService } from './services/sync-executor.service';

describe('SyncEventListener (In-Memory Event Driven Sync)', () => {
  let listener: SyncEventListener;
  let syncExecutor: jest.Mocked<Partial<SyncExecutorService>>;

  beforeEach(async () => {
    syncExecutor = {
      syncInstitutions: jest.fn().mockResolvedValue({ totalInstitutions: 1, attendanceSynced: true, crmsSynced: true }),
      syncSubjects: jest.fn().mockResolvedValue({ totalSubjects: 1, attendanceSynced: true, crmsSynced: true }),
      syncCandidates: jest.fn().mockResolvedValue({ totalCandidates: 1, attendanceSynced: 1, crmsSynced: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SyncEventListener,
        {
          provide: SyncExecutorService,
          useValue: syncExecutor,
        },
      ],
    }).compile();

    listener = module.get<SyncEventListener>(SyncEventListener);
  });

  it('should trigger syncInstitutions when institution.updated event is received', async () => {
    await listener.handleInstitutionUpdated({
      universityId: 'uni-123',
      userId: 'admin-1',
      data: { name: 'Morgan Green University' },
    });

    expect(syncExecutor.syncInstitutions).toHaveBeenCalledWith(['uni-123'], false);
  });

  it('should trigger syncSubjects when subject.updated event is received', async () => {
    await listener.handleSubjectUpdated({
      subjectId: 'sub-456',
      userId: 'admin-1',
      data: { name: 'Mathematics' },
    });

    expect(syncExecutor.syncSubjects).toHaveBeenCalledWith(['sub-456'], false);
  });

  it('should trigger syncCandidates when candidate.updated event is received', async () => {
    await listener.handleCandidateUpdated({
      registrationId: 'reg-789',
      userId: 'student-1',
      data: { first_name: 'Goodness' },
    });

    expect(syncExecutor.syncCandidates).toHaveBeenCalledWith(['reg-789']);
  });
});
