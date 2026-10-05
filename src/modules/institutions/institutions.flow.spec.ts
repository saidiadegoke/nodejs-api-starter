import { Test, TestingModule } from '@nestjs/testing';
import { InstitutionsService } from './services/institutions.service';
import { InstitutionAdminProvisionService } from './services/institution-admin-provision.service';
import { UniversityRepository } from './repositories/university.repository';
import { InstitutionSyncQueueService, SyncEvent } from '../sync';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerFactory } from '../../logger';
import { DataSource } from 'typeorm';
import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { UniversityTypeEnum } from './dtos/university.dto';

describe('Institutions University Creation Flow (End-to-End)', () => {
  let institutionsService: InstitutionsService;
  let universityRepo: jest.Mocked<Partial<UniversityRepository>>;
  let syncQueueService: jest.Mocked<Partial<InstitutionSyncQueueService>>;
  let eventEmitter: jest.Mocked<Partial<EventEmitter2>>;
  let mockDataSource: any;
  let mockQueryRunner: any;

  const mockLoggerFactory = {
    create: jest.fn().mockReturnValue({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    }),
  };

  beforeEach(async () => {
    mockQueryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      isTransactionActive: false,
      query: jest.fn(),
    };

    mockDataSource = {
      createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
      query: jest.fn(),
    };

    universityRepo = {
      findByCode: jest.fn().mockResolvedValue(null),
      findByJupebPrefix: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      softDelete: jest.fn().mockResolvedValue(undefined),
    };

    syncQueueService = {
      enqueueInstitutionSyncJob: jest.fn().mockResolvedValue({} as any),
    };

    eventEmitter = {
      emit: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InstitutionsService,
        InstitutionAdminProvisionService,
        {
          provide: UniversityRepository,
          useValue: universityRepo,
        },
        {
          provide: InstitutionSyncQueueService,
          useValue: syncQueueService,
        },
        {
          provide: EventEmitter2,
          useValue: eventEmitter,
        },
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: LoggerFactory,
          useValue: mockLoggerFactory,
        },
      ],
    }).compile();

    institutionsService = module.get<InstitutionsService>(InstitutionsService);
  });

  describe('POST /catalog/universities flow', () => {
    it('successfully creates university and provisions institution_admin with correct SQL queries (no slug or users.first_name column)', async () => {
      const universityDto = {
        code: 'TST-UNI',
        name: 'Test University of Technology',
        jupeb_prefix: '123',
        university_type: UniversityTypeEnum.FEDERAL,
        email: 'admin@tst-uni.edu.ng',
        admin_first_name: 'Jane',
        admin_last_name: 'Doe',
        phone: '+2348012345678',
        address: '1 Test Campus Road',
        expected_candidate_count: 500,
        description: 'Premier test university',
      };

      const createdUniRecord: any = {
        id: 'uni-uuid-1234',
        code: 'TST-UNI',
        name: 'Test University of Technology',
        jupebPrefix: '123',
        universityType: 'federal',
        email: 'admin@tst-uni.edu.ng',
        address: '1 Test Campus Road',
        phone: '+2348012345678',
        expectedCandidateCount: 500,
        description: 'Premier test university',
        status: 'active',
      };

      universityRepo.create!.mockResolvedValue(createdUniRecord);

      // 1. Check existing user in dataSource.query -> none found
      mockDataSource.query.mockResolvedValueOnce([]);

      // 2. queryRunner queries during provision:
      // a) INSERT INTO users (email, password_hash, status, email_verified, ...) RETURNING *
      // b) INSERT INTO profiles (user_id, first_name, last_name, display_name, jupeb_university_id, ...)
      // c) SELECT id FROM roles WHERE name = 'institution_admin' LIMIT 1
      // d) INSERT INTO user_roles (user_id, role_id, assigned_by, ...)
      // e) INSERT INTO user_universities (user_id, university_id, role, is_primary, ...)
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 'user-uuid-5678', email: 'admin@tst-uni.edu.ng' }]) // INSERT users
        .mockResolvedValueOnce([{ id: 'prof-uuid-9999' }]) // INSERT profiles
        .mockResolvedValueOnce([{ id: 'role-uuid-inst-admin' }]) // SELECT roles WHERE name = 'institution_admin'
        .mockResolvedValueOnce([]) // INSERT user_roles
        .mockResolvedValueOnce([]); // INSERT user_universities

      const result = await institutionsService.create(universityDto, 'creator-superadmin-id');

      expect(result).toBeDefined();
      expect(result.id).toBe('uni-uuid-1234');
      expect(result.institution_admin).toEqual({
        user_id: 'user-uuid-5678',
        email: 'admin@tst-uni.edu.ng',
        first_name: 'Jane',
        last_name: 'Doe',
      });

      // Verify that universityRepo was called with cleaned prefix
      expect(universityRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          code: 'TST-UNI',
          name: 'Test University of Technology',
          jupebPrefix: '123',
          email: 'admin@tst-uni.edu.ng',
        }),
      );

      // Verify transaction commit
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalled();

      // Verify the SQL used for role lookup matches name = 'institution_admin' and does NOT have 'slug'
      const roleQueryCall = mockQueryRunner.query.mock.calls.find((call: any[]) =>
        call[0].includes('roles'),
      );
      expect(roleQueryCall).toBeDefined();
      expect(roleQueryCall[0]).toContain("WHERE name = 'institution_admin'");
      expect(roleQueryCall[0]).not.toContain('slug');

      // Verify sync queue and event emitter were triggered
      expect(syncQueueService.enqueueInstitutionSyncJob).toHaveBeenCalledWith({
        universityIds: ['uni-uuid-1234'],
        userId: 'creator-superadmin-id',
        triggeredBy: 'institution_created',
      });
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        SyncEvent.INSTITUTION_UPDATED,
        expect.objectContaining({
          universityId: 'uni-uuid-1234',
        }),
      );
    });

    it('rejects duplicate university code with 409 Conflict', async () => {
      universityRepo.findByCode!.mockResolvedValue({ id: 'existing-id' } as any);

      await expect(
        institutionsService.create({
          code: 'EXISTING',
          name: 'Existing University',
          jupeb_prefix: '123',
          email: 'existing@edu.ng',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects invalid jupeb_prefix with 422 UnprocessableEntity', async () => {
      await expect(
        institutionsService.create({
          code: 'BAD-PREFIX',
          name: 'Bad Prefix University',
          jupeb_prefix: 'INVALID-PREFIX',
          email: 'bad@edu.ng',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rolls back and soft-deletes university if admin provisioning fails', async () => {
      const createdUniRecord: any = {
        id: 'uni-uuid-fail',
        code: 'FAIL-UNI',
        name: 'Fail University',
        jupebPrefix: '999',
        status: 'active',
      };
      universityRepo.create!.mockResolvedValue(createdUniRecord);

      // Empty email for provisioning triggers 422
      await expect(
        institutionsService.create({
          code: 'FAIL-UNI',
          name: 'Fail University',
          jupeb_prefix: '999',
          email: '',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      // University should be soft deleted upon failure
      expect(universityRepo.softDelete).toHaveBeenCalledWith('uni-uuid-fail');
    });
  });
});
