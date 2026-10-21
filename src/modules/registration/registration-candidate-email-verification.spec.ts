import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException } from '@nestjs/common';
import { RegistrationService } from './services/registration.service';
import { RegistrationRepository } from './repositories/registration.repository';
import { RegistrationDocumentRepository } from './repositories/registration-document.repository';
import { RegistrationStatusHistoryRepository } from './repositories/registration-status-history.repository';
import { RegistrationStateService } from './services/registration-state.service';
import { RegistrationKpiService } from './services/registration-kpi.service';
import { RegistrationEventsService } from './services/registration-events.service';
import { RegistrationFormPdfService } from './services/registration-form-pdf.service';
import { CandidateSyncQueueService } from '../sync';
import { InstitutionUserScopeService } from './services/institution-user-scope.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../logger';
import { RegistrationStatus } from './entities/registration.entity';
import { RegistrationEvent } from './constants/registration-events.enum';
import { AuthService } from '../auth';
import { InstitutionRegistrationLockService } from '@modules/sessions';

describe('Candidate Email Update & Verification Flow', () => {
  let registrationService: RegistrationService;
  let mockRegRepo: any;
  let mockDataSource: any;
  let mockEventEmitter: any;
  let sendVerificationEmailSpy: jest.SpyInstance;

  beforeEach(async () => {
    mockRegRepo = {
      findAllPaginated: jest.fn(),
      findById: jest.fn(),
      findByCandidateCode: jest.fn(),
      findByUserId: jest.fn(),
      updateById: jest.fn(),
    };

    mockDataSource = {
      query: jest.fn(),
    };

    mockEventEmitter = {
      emit: jest.fn(),
    };

    const mockLoggerFactory = {
      create: () => ({
        log: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      }),
    };

    sendVerificationEmailSpy = jest
      .spyOn(AuthService, 'sendVerificationEmail')
      .mockResolvedValue({ token: 'mock-verify-token' });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: RegistrationRepository, useValue: mockRegRepo },
        { provide: RegistrationDocumentRepository, useValue: { findByRegistrationId: jest.fn().mockResolvedValue([]) } },
        { provide: RegistrationStatusHistoryRepository, useValue: { findByRegistrationId: jest.fn().mockResolvedValue([]) } },
        { provide: RegistrationStateService, useValue: {} },
        { provide: RegistrationKpiService, useValue: {} },
        { provide: RegistrationEventsService, useValue: {} },
        { provide: RegistrationFormPdfService, useValue: {} },
        { provide: CandidateSyncQueueService, useValue: {} },
        {
          provide: InstitutionUserScopeService,
          useValue: {
            effectiveUniversityId: jest.fn().mockImplementation((_u, uniId) => Promise.resolve(uniId || 'uni-1')),
            assertUniversityAccess: jest.fn().mockResolvedValue(true),
          },
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

    registrationService = module.get<RegistrationService>(RegistrationService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('updateCandidateProfile for candidate WITH user account', () => {
    const regId = 'aeb4fd4a-8bb7-4985-9191-12f57a8b2a3d';
    const userId = 'user-uuid-123';

    it('detects email change, resets email_verified to false, dispatches verification email, and returns email_verified: false', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId,
        ninVerificationId: 'nin-uuid-456',
        status: RegistrationStatus.CLAIMED,
      });

      mockDataSource.query.mockImplementation(async (sql: string, _params?: any[]) => {
        // Current user check
        if (sql.includes('SELECT id, email, email_verified FROM users WHERE id = $1')) {
          return [{ id: userId, email: 'old-email@example.com', email_verified: true }];
        }
        // Conflict check
        if (sql.includes('SELECT id FROM users WHERE LOWER(TRIM(email))')) {
          return []; // no conflict
        }
        // Update users
        if (sql.includes('UPDATE users SET')) {
          return [];
        }
        // Update NIN verification intake_payload
        if (sql.includes('UPDATE jupeb_nin_verifications')) {
          return [];
        }
        // getRegistrationById details query
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: regId,
              university_id: 'uni-1',
              user_id: userId,
              status: 'claimed',
              email: 'new-email@example.com',
              phone: '08012345678',
              email_verified: false,
              nin_id: 'nin-uuid-456',
              nin_status: 'verified',
              nin_payload: { first_name: 'John', last_name: 'Doe' },
              nin_intake: { email: 'new-email@example.com' },
            },
          ];
        }
        return [];
      });

      const result = await registrationService.updateCandidateProfile(
        regId,
        { email: 'new-email@example.com' },
        'admin-user-id',
      );

      // Verify users table was updated with email_verified = false and email_verified_at = NULL
      const updateUsersCall = mockDataSource.query.mock.calls.find((call: any[]) =>
        call[0].includes('UPDATE users SET') && call[0].includes('email_verified = false'),
      );
      expect(updateUsersCall).toBeDefined();

      // Verify verification email was dispatched to candidate's user id
      expect(sendVerificationEmailSpy).toHaveBeenCalledWith(userId);

      // Verify boolean email_verified is explicitly false on response and candidate
      expect(result.email_verified).toBe(false);
      expect(result.candidate.email_verified).toBe(false);
    });

    it('throws ConflictException if new email is already taken by another user', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId,
        ninVerificationId: 'nin-uuid-456',
        status: RegistrationStatus.CLAIMED,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT id, email, email_verified FROM users WHERE id = $1')) {
          return [{ id: userId, email: 'old-email@example.com', email_verified: true }];
        }
        if (sql.includes('SELECT id FROM users WHERE LOWER(TRIM(email))')) {
          return [{ id: 'other-user-uuid' }]; // duplicate user found
        }
        return [];
      });

      await expect(
        registrationService.updateCandidateProfile(
          regId,
          { email: 'already-taken@example.com' },
          'admin-user-id',
        ),
      ).rejects.toThrow(ConflictException);

      expect(sendVerificationEmailSpy).not.toHaveBeenCalled();
    });
  });

  describe('updateCandidateProfile for candidate WITHOUT user account (code_issued)', () => {
    const regId = 'aeb4fd4a-8bb7-4985-9191-12f57a8b2a3d';

    it('updates intake_payload with new email, re-emits CODE_ISSUED event, and returns email_verified: false', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId: null,
        ninVerificationId: 'nin-uuid-456',
        status: RegistrationStatus.CODE_ISSUED,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('SELECT intake_payload FROM jupeb_nin_verifications WHERE id = $1')) {
          return [{ intake_payload: { email: 'old-intake@example.com', name: 'John Doe' } }];
        }
        if (sql.includes('UPDATE jupeb_nin_verifications')) {
          return [];
        }
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: regId,
              university_id: 'uni-1',
              user_id: null,
              status: 'code_issued',
              email: null,
              email_verified: null,
              nin_id: 'nin-uuid-456',
              nin_status: 'verified',
              nin_payload: { first_name: 'John', last_name: 'Doe' },
              nin_intake: { email: 'updated-intake@example.com', name: 'John Doe', email_verified: false },
            },
          ];
        }
        return [];
      });

      const result = await registrationService.updateCandidateProfile(
        regId,
        { email: 'updated-intake@example.com' },
        'admin-user-id',
      );

      // Verify intake_payload update was executed with new email and email_verified: false
      const updateNinCall = mockDataSource.query.mock.calls.find(
        (call: any[]) =>
          call[0].includes('UPDATE jupeb_nin_verifications') &&
          call[1] &&
          JSON.stringify(call[1]).includes('updated-intake@example.com'),
      );
      expect(updateNinCall).toBeDefined();

      // Verify CODE_ISSUED event was re-emitted so candidate receives code at new email
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        RegistrationEvent.CODE_ISSUED,
        expect.objectContaining({ registrationId: regId }),
      );

      // Verify boolean email_verified is explicitly false
      expect(result.email_verified).toBe(false);
      expect(result.candidate.email_verified).toBe(false);
    });
  });

  describe('getRegistrationById returns boolean email_verified', () => {
    const regId = 'aeb4fd4a-8bb7-4985-9191-12f57a8b2a3d';

    it('returns email_verified: true when user email is verified', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId: 'user-1',
        status: RegistrationStatus.APPROVED,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: regId,
              university_id: 'uni-1',
              user_id: 'user-1',
              status: 'approved',
              email: 'verified@example.com',
              email_verified: true,
            },
          ];
        }
        return [];
      });

      const result = await registrationService.getRegistrationById(regId, 'user-admin');
      expect(result.email_verified).toBe(true);
      expect(result.candidate.email_verified).toBe(true);
    });

    it('returns email_verified: true initially for code_issued candidates upon code issuance', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId: null,
        status: RegistrationStatus.CODE_ISSUED,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: regId,
              university_id: 'uni-1',
              user_id: null,
              status: 'code_issued',
              email: null,
              email_verified: null,
              nin_intake: { email: 'candidate@example.com' },
            },
          ];
        }
        return [];
      });

      const result = await registrationService.getRegistrationById(regId, 'user-admin');
      expect(result.email_verified).toBe(true);
      expect(result.candidate.email_verified).toBe(true);
    });

    it('returns email_verified: false when candidate user email was updated and not yet verified', async () => {
      mockRegRepo.findById.mockResolvedValue({
        id: regId,
        universityId: 'uni-1',
        userId: 'user-1',
        status: RegistrationStatus.CLAIMED,
      });

      mockDataSource.query.mockImplementation(async (sql: string) => {
        if (sql.includes('FROM jupeb_registrations r')) {
          return [
            {
              id: regId,
              university_id: 'uni-1',
              user_id: 'user-1',
              status: 'claimed',
              email: 'unverified-updated@example.com',
              email_verified: false,
            },
          ];
        }
        return [];
      });

      const result = await registrationService.getRegistrationById(regId, 'user-admin');
      expect(result.email_verified).toBe(false);
      expect(result.candidate.email_verified).toBe(false);
    });
  });
});
