import { Test, TestingModule } from '@nestjs/testing';
import { InstitutionsService } from './services/institutions.service';
import { InstitutionAdminProvisionService } from './services/institution-admin-provision.service';
import { UniversityRepository } from './repositories/university.repository';
import { InstitutionSyncQueueService, SyncEvent } from '../sync';
import { MailService } from '../mail';
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
          provide: MailService,
          useValue: {
            sendInstitutionAdminCredentialsEmail: jest.fn().mockResolvedValue('msg-id-123'),
          },
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
        code: '123',
        name: 'Test University of Technology',
        jupeb_prefix: 'TST-UNI',
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
        code: '123',
        name: 'Test University of Technology',
        jupebPrefix: 'TST-UNI',
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
          code: '123',
          name: 'Test University of Technology',
          jupebPrefix: 'TST-UNI',
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
          code: '123',
          name: 'Existing University',
          jupeb_prefix: 'EXISTING',
          email: 'existing@edu.ng',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects invalid code with 422 UnprocessableEntity', async () => {
      await expect(
        institutionsService.create({
          code: 'INVALID-CODE',
          name: 'Bad Code University',
          jupeb_prefix: 'PREFIX',
          email: 'bad@edu.ng',
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rolls back and soft-deletes university if admin provisioning fails', async () => {
      const createdUniRecord: any = {
        id: 'uni-uuid-fail',
        code: '999',
        name: 'Fail University',
        jupebPrefix: 'FAIL-UNI',
        status: 'active',
      };
      universityRepo.create!.mockResolvedValue(createdUniRecord);

      // Empty email for provisioning triggers 422
      await expect(
        institutionsService.create({
          code: '999',
          name: 'Fail University',
          jupeb_prefix: 'FAIL-UNI',
          email: '',
        }),
      ).rejects.toThrow(UnprocessableEntityException);

      // University should be soft deleted upon failure
      expect(universityRepo.softDelete).toHaveBeenCalledWith('uni-uuid-fail');
    });
  });

  describe('listAdmin flow', () => {
    it('returns institutions enriched with enrolled_count and lock fields', async () => {
      const uni1: any = { id: 'uni-1', code: '001', name: 'University 1' };
      const uni2: any = { id: 'uni-2', code: '002', name: 'University 2' };
      universityRepo.findAllAdmin = jest.fn().mockResolvedValue([[uni1, uni2], 2]);
      universityRepo.enrolledCountsForUniversities = jest
        .fn()
        .mockResolvedValue(new Map([['uni-1', 42]]));
      universityRepo.locksForUniversities = jest.fn().mockResolvedValue(
        new Map([
          [
            'uni-1',
            {
              locked: true,
              reason: 'Quota reached',
              locked_at: new Date('2026-01-01'),
              locked_by: 'admin-1',
            },
          ],
        ]),
      );

      const res = await institutionsService.listAdmin({
        page: 1,
        limit: 10,
        session_id: 'session-123',
      } as any);

      expect(res.total).toBe(2);
      expect(res.rows).toHaveLength(2);
      expect(res.rows[0]).toMatchObject({
        id: 'uni-1',
        enrolled_count: 42,
        locked: true,
        is_locked: true,
        lock_reason: 'Quota reached',
      });
      expect(res.rows[1]).toMatchObject({
        id: 'uni-2',
        enrolled_count: 0,
        locked: false,
        is_locked: false,
        lock_reason: null,
        locked_at: null,
      });
    });
  });

  describe('bulkCreate validation & upload flow', () => {
    beforeEach(() => {
      mockDataSource.query = jest.fn().mockResolvedValue([]);
      mockQueryRunner.query = jest.fn().mockImplementation((sql: string) => {
        if (sql.includes('INSERT INTO users')) {
          return [{ id: 'user-provisioned-123', email: 'test@admin.edu.ng' }];
        }
        if (sql.includes('INSERT INTO profiles')) {
          return [{ id: 'prof-uuid-9999' }];
        }
        if (sql.includes('SELECT id FROM roles')) {
          return [{ id: 'role-inst-admin' }];
        }
        return [];
      });
      universityRepo.create = jest.fn().mockImplementation((dto) =>
        Promise.resolve({
          id: 'uni-' + dto.code,
          ...dto,
        } as any),
      );
    });

    it('processes standard CSV format with 3-digit code and uppercase acronym prefix', async () => {
      const csv = `code,name,jupeb_prefix,short_name,email
001,University of Lagos,UNILAG,UNILAG,admin@unilag.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.outcomes[0].ok).toBe(true);
      expect(result.outcomes[0].data.code).toBe('001');
      expect(result.outcomes[0].data.jupeb_prefix).toBe('UNILAG');
    });

    it('detects inverted/swapped CSV and correctly swaps code and jupeb_prefix', async () => {
      const csv = `code,name,jupeb_prefix,email
UNILAG,University of Lagos,001,admin@unilag.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(0);
      expect(result.outcomes[0].ok).toBe(true);
      expect(result.outcomes[0].data.code).toBe('001');
      expect(result.outcomes[0].data.jupeb_prefix).toBe('UNILAG');
    });

    it('pads 1 or 2 digit codes to 3 digits (e.g. 5 -> 005)', async () => {
      const csv = `code,name,jupeb_prefix,email
5,Abia State University,ABSU,admin@absu.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.outcomes[0].data.code).toBe('005');
      expect(result.outcomes[0].data.jupeb_prefix).toBe('ABSU');
    });

    it('normalizes headers and supports aliases (center_code, admin_email, quota, BOM)', async () => {
      const csv = `\uFEFFcenter_code,institution_name,prefix,admin_email,quota,type
029,Lagos State University,LASU,admin@lasu.edu.ng,500,state`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(1);
      expect(result.outcomes[0].data.code).toBe('029');
      expect(result.outcomes[0].data.name).toBe('Lagos State University');
      expect(result.outcomes[0].data.jupeb_prefix).toBe('LASU');
      expect(result.outcomes[0].data.email).toBe('admin@lasu.edu.ng');
    });

    it('validates missing required name with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email
001,,UNILAG,admin@unilag.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/Institution name is required/i);
    });

    it('validates missing or invalid non-numeric code with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email
ABC,Unknown University,XYZ,admin@xyz.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/numeric (characters|digits)/i);
    });

    it('validates missing email with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email
001,University of Lagos,UNILAG,`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/Admin email is required/i);
    });

    it('validates invalid email format with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email
001,University of Lagos,UNILAG,not-an-email`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/Invalid email address format/i);
    });

    it('validates invalid university_type with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email,university_type
001,University of Lagos,UNILAG,admin@unilag.edu.ng,polytechnic`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/Invalid university_type/i);
    });

    it('validates invalid expected_candidate_count with validation_error', async () => {
      const csv = `code,name,jupeb_prefix,email,expected_candidate_count
001,University of Lagos,UNILAG,admin@unilag.edu.ng,-10`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(1);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(false);
      expect(result.outcomes[0].error_code).toBe('validation_error');
      expect(result.outcomes[0].error_message).toMatch(/expected_candidate_count must be a non-negative integer/i);
    });

    it('catches in-batch duplicate code and marks second row as duplicate', async () => {
      const csv = `code,name,jupeb_prefix,email
001,University 1,UNI1,admin1@test.edu.ng
001,University 2,UNI2,admin2@test.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(true);
      expect(result.outcomes[1].ok).toBe(false);
      expect(result.outcomes[1].error_code).toBe('duplicate');
      expect(result.outcomes[1].error_message).toMatch(/Duplicate code "001" in CSV \(first seen at row 1\)/i);
    });

    it('catches in-batch duplicate jupeb_prefix and marks second row as duplicate', async () => {
      const csv = `code,name,jupeb_prefix,email
001,University 1,DUPREF,admin1@test.edu.ng
002,University 2,DUPREF,admin2@test.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(true);
      expect(result.outcomes[1].ok).toBe(false);
      expect(result.outcomes[1].error_code).toBe('duplicate');
      expect(result.outcomes[1].error_message).toMatch(/Duplicate jupeb_prefix "DUPREF" in CSV \(first seen at row 1\)/i);
    });

    it('catches in-batch duplicate admin email and marks second row as duplicate', async () => {
      const csv = `code,name,jupeb_prefix,email
001,University 1,UNI1,same-admin@test.edu.ng
002,University 2,UNI2,same-admin@test.edu.ng`;

      const result = await institutionsService.bulkCreate(csv);
      expect(result.total).toBe(2);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.outcomes[0].ok).toBe(true);
      expect(result.outcomes[1].ok).toBe(false);
      expect(result.outcomes[1].error_code).toBe('duplicate');
      expect(result.outcomes[1].error_message).toMatch(/Duplicate admin email "same-admin@test.edu.ng" in CSV \(first seen at row 1\)/i);
    });
  });
});
