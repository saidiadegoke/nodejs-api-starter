import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RegistrationService } from './registration.service';
import { RegistrationRepository } from '../repositories/registration.repository';
import { RegistrationDocumentRepository } from '../repositories/registration-document.repository';
import { RegistrationStatusHistoryRepository } from '../repositories/registration-status-history.repository';
import { RegistrationStateService } from './registration-state.service';
import { RegistrationKpiService } from './registration-kpi.service';
import { RegistrationEventsService } from './registration-events.service';
import { RegistrationFormPdfService } from './registration-form-pdf.service';
import { CandidateSyncQueueService } from '@modules/sync';
import { InstitutionUserScopeService } from './institution-user-scope.service';
import { InstitutionRegistrationLockService } from '@modules/sessions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { RegistrationStatus } from '../entities/registration.entity';
import { RegistrationEvent } from '../constants/registration-events.enum';
import { SyncEvent } from '../../sync/constants/sync-events.enum';

describe('RegistrationService.updateCandidateProfile', () => {
  let service: RegistrationService;
  let mockRegRepo: any;
  let mockDocRepo: any;
  let mockHistoryRepo: any;
  let mockDataSource: any;
  let mockEventEmitter: any;
  let queryCalls: Array<{ sql: string; params?: any[] }>;

  const REG_ID = '11111111-2222-4333-8444-555555555555';
  const NIN_ID = '66666666-7777-4888-8999-000000000000';
  const USER_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

  beforeEach(async () => {
    queryCalls = [];

    mockRegRepo = {
      findById: jest.fn(),
      updateById: jest.fn().mockResolvedValue({ id: REG_ID }),
      setStatus: jest.fn().mockResolvedValue(true),
    };

    mockDocRepo = {
      create: jest.fn().mockResolvedValue({ id: 'doc-1' }),
      findByRegistrationId: jest.fn().mockResolvedValue([]),
    };

    mockHistoryRepo = {
      create: jest.fn().mockResolvedValue({ id: 'hist-1' }),
      findByRegistrationId: jest.fn().mockResolvedValue([]),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    mockDataSource = {
      query: jest.fn(async (sql: string, params?: any[]) => {
        queryCalls.push({ sql, params });

        // Registration detail query in getRegistrationById
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: REG_ID,
              user_id: null,
              university_id: 'uni-1',
              session_id: 'sess-1',
              subject_combination_id: 'sc-1',
              institution_issued_code: 'INST-001',
              status: 'code_issued',
              nin_id: NIN_ID,
              nin_status: 'pending',
              nin_payload: {},
              nin_intake: {
                first_name: 'John',
                middle_name: 'Adam',
                last_name: 'Smith',
                name: 'John Adam Smith',
                email: 'john.smith@example.com',
                phone: '08012345678',
                gender: 'male',
                date_of_birth: '2004-05-15',
                state_of_origin: 'Oyo State',
                lga: 'Ibadan North',
                residential_address: '10 Campus Road',
                place_of_birth: 'Ibadan',
              },
            },
          ];
        }

        // Intake select in updateNinIntakePayload
        if (sql.includes('SELECT intake_payload FROM jupeb_nin_verifications')) {
          return [
            {
              intake_payload: {
                first_name: 'John',
                middle_name: 'Adam',
                last_name: 'Smith',
                email: 'old.email@example.com',
              },
            },
          ];
        }

        // Profiles select
        if (sql.includes('SELECT first_name, last_name, display_name FROM profiles')) {
          return [{ first_name: 'John', last_name: 'Smith', display_name: 'John Smith' }];
        }

        // Users select
        if (sql.includes('SELECT id, email, email_verified FROM users')) {
          return [{ id: USER_ID, email: 'john@example.com', email_verified: true }];
        }

        return [];
      }),
    };

    const mockLoggerFactory = {
      create: () => ({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: RegistrationRepository, useValue: mockRegRepo },
        { provide: RegistrationDocumentRepository, useValue: mockDocRepo },
        { provide: RegistrationStatusHistoryRepository, useValue: mockHistoryRepo },
        { provide: RegistrationStateService, useValue: {} },
        { provide: RegistrationKpiService, useValue: {} },
        { provide: RegistrationEventsService, useValue: {} },
        { provide: RegistrationFormPdfService, useValue: {} },
        { provide: CandidateSyncQueueService, useValue: {} },
        {
          provide: InstitutionUserScopeService,
          useValue: { assertUniversityAccess: jest.fn().mockResolvedValue(true) },
        },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LoggerFactory, useValue: mockLoggerFactory },
        {
          provide: InstitutionRegistrationLockService,
          useValue: { assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  it('throws NotFoundException if registration does not exist', async () => {
    mockRegRepo.findById.mockResolvedValue(null);
    await expect(
      service.updateCandidateProfile('00000000-0000-4000-8000-000000000000', {}),
    ).rejects.toThrow(NotFoundException);
  });

  describe('Unclaimed candidate in pending status (userId is null)', () => {
    beforeEach(() => {
      mockRegRepo.findById.mockResolvedValue({
        id: REG_ID,
        universityId: 'uni-1',
        sessionId: 'sess-1',
        userId: null,
        ninVerificationId: NIN_ID,
        status: RegistrationStatus.CODE_ISSUED,
      });
    });

    it('updates intake_payload WITHOUT updated_at column so query succeeds and reflects in response', async () => {
      const dto = {
        first_name: 'Alexander',
        last_name: 'Hamilton',
        middle_name: 'G',
        email: 'alex@example.com',
        phone: '08099998888',
        gender: 'male',
        date_of_birth: '2005-01-11',
        state_of_origin: 'Lagos State',
        lga: 'Ikeja',
        residential_address: '42 Broad Street',
        place_of_birth: 'Lagos',
      };

      const result = await service.updateCandidateProfile(REG_ID, dto, 'admin-1');

      // Verify the nin_verifications query did NOT include "updated_at = NOW()"
      const ninUpdateCall = queryCalls.find((c) =>
        c.sql.includes('UPDATE jupeb_nin_verifications'),
      );
      expect(ninUpdateCall).toBeDefined();
      expect(ninUpdateCall!.sql).not.toContain('updated_at');
      expect(ninUpdateCall!.sql).toContain('intake_payload = COALESCE(intake_payload, \'{}\'::jsonb) || $2::jsonb');

      // Verify intake payload received all patched fields
      const payloadArg = JSON.parse(ninUpdateCall!.params![1]);
      expect(payloadArg.first_name).toBe('Alexander');
      expect(payloadArg.last_name).toBe('Hamilton');
      expect(payloadArg.middle_name).toBe('G');
      expect(payloadArg.name).toBe('Alexander G Hamilton');
      expect(payloadArg.email).toBe('alex@example.com');
      expect(payloadArg.phone).toBe('08099998888');
      expect(payloadArg.gender).toBe('male');
      expect(payloadArg.date_of_birth).toBe('2005-01-11');
      expect(payloadArg.state_of_origin).toBe('Lagos State');
      expect(payloadArg.lga).toBe('Ikeja');
      expect(payloadArg.residential_address).toBe('42 Broad Street');
      expect(payloadArg.place_of_birth).toBe('Lagos');

      // Verify events emitted
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RegistrationEvent.CODE_ISSUED,
        expect.objectContaining({ registrationId: REG_ID }),
      );
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        SyncEvent.CANDIDATE_UPDATED,
        expect.objectContaining({ registrationId: REG_ID }),
      );

      // Verify result returned from getRegistrationById
      expect(result).toBeDefined();
      expect((result as any).id).toBe(REG_ID);
    });

    it('updates subject_combination_id and institution_issued_code on jupeb_registrations', async () => {
      const dto = {
        subject_combination_id: 'sc-uuid-new',
        institution_issued_code: 'CODE-999',
      };

      await service.updateCandidateProfile(REG_ID, dto, 'admin-1');

      const regUpdateCall = queryCalls.find((c) =>
        c.sql.includes('UPDATE jupeb_registrations SET'),
      );
      expect(regUpdateCall).toBeDefined();
      expect(regUpdateCall!.sql).toContain('subject_combination_id = $1');
      expect(regUpdateCall!.sql).toContain('institution_issued_code = $2');
      expect(regUpdateCall!.params).toEqual(['sc-uuid-new', 'CODE-999', REG_ID]);
    });
  });

  describe('Claimed candidate in pending status (userId is present)', () => {
    beforeEach(() => {
      mockRegRepo.findById.mockResolvedValue({
        id: REG_ID,
        universityId: 'uni-1',
        sessionId: 'sess-1',
        userId: USER_ID,
        ninVerificationId: NIN_ID,
        status: RegistrationStatus.PENDING_INSTITUTION_REVIEW,
      });
    });

    it('upserts profiles table with ON CONFLICT (user_id) DO UPDATE and syncs middle_name to intake_payload', async () => {
      const dto = {
        first_name: 'Grace',
        middle_name: 'Brewster',
        last_name: 'Hopper',
        gender: 'female',
        date_of_birth: '2003-12-09',
        residential_address: '1 Computer Way',
        state_of_origin: 'Ogun State',
        lga: 'Abeokuta South',
        place_of_birth: 'Abeokuta',
      };

      await service.updateCandidateProfile(REG_ID, dto, 'admin-1');

      // Verify profiles upsert
      const profileUpsert = queryCalls.find((c) => c.sql.includes('INSERT INTO profiles'));
      expect(profileUpsert).toBeDefined();
      expect(profileUpsert!.sql).toContain('ON CONFLICT (user_id) DO UPDATE');
      expect(profileUpsert!.sql).toContain('updated_at = NOW()');

      // Verify nin_verifications intake sync (includes middle_name)
      const ninUpdate = queryCalls.find((c) => c.sql.includes('UPDATE jupeb_nin_verifications'));
      expect(ninUpdate).toBeDefined();
      const payloadArg = JSON.parse(ninUpdate!.params![1]);
      expect(payloadArg.middle_name).toBe('Brewster');
      expect(payloadArg.name).toBe('Grace Brewster Hopper');
    });

    it('upserts Next of Kin with registration_id conflict clause', async () => {
      const dto = {
        next_of_kin: {
          name: 'Jane Hopper',
          relationship: 'Mother',
          phone: '08055554444',
          email: 'jane.hopper@example.com',
          address: '2 Mother Lane',
        },
      };

      await service.updateCandidateProfile(REG_ID, dto, 'admin-1');

      const nokCall = queryCalls.find((c) => c.sql.includes('INSERT INTO jupeb_next_of_kin'));
      expect(nokCall).toBeDefined();
      expect(nokCall!.sql).toContain('ON CONFLICT (registration_id) WHERE (deleted_at IS NULL) DO UPDATE');
      expect(nokCall!.params![0]).toBe(REG_ID);
      expect(nokCall!.params![1]).toBe('Jane Hopper');
      expect(nokCall!.params![2]).toBe('Mother');
      expect(nokCall!.params![3]).toBe('08055554444');
      expect(nokCall!.params![4]).toBe('jane.hopper@example.com');
      expect(nokCall!.params![5]).toBe('2 Mother Lane');
    });
  });
});
