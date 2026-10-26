import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationService } from './services/registration.service';
import { RegistrationController } from './controllers/registration.controller';
import { RegistrationRepository } from './repositories/registration.repository';
import { RegistrationDocumentRepository } from './repositories/registration-document.repository';
import { RegistrationStatusHistoryRepository } from './repositories/registration-status-history.repository';
import { RegistrationStateService } from './services/registration-state.service';
import { RegistrationKpiService } from './services/registration-kpi.service';
import { RegistrationEventsService } from './services/registration-events.service';
import { RegistrationFormPdfService } from './services/registration-form-pdf.service';
import { CandidateSyncQueueService } from '@modules/sync';
import { InstitutionUserScopeService } from './services/institution-user-scope.service';
import { InstitutionRegistrationLockService } from '@modules/sessions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../logger';
import { RegistrationStatus } from './entities/registration.entity';
import { UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';

describe('Registration batch approval and biometric photo fallback', () => {
  let registrationService: RegistrationService;
  let registrationController: RegistrationController;
  let mockRegRepo: any;
  let mockDataSource: any;
  let mockHistoryRepo: any;
  let mockEventsService: any;

  const candidateRegId = 'fea3258b-1912-4b58-9a55-a8d5914a1a40';

  beforeEach(async () => {
    mockRegRepo = {
      findById: jest.fn().mockImplementation((id: string) => {
        if (id === candidateRegId) {
          return Promise.resolve({
            id: candidateRegId,
            status: RegistrationStatus.PENDING_INSTITUTION_REVIEW,
            universityId: 'uni-1',
            userId: 'user-1',
          });
        }
        return Promise.resolve(null);
      }),
      setStatus: jest.fn().mockResolvedValue(true),
    };

    mockHistoryRepo = {
      create: jest.fn().mockResolvedValue(true),
      findByRegistrationId: jest.fn().mockResolvedValue([]),
    };

    mockEventsService = {
      emitRegistrationApproved: jest.fn().mockResolvedValue(undefined),
    };

    mockDataSource = {
      query: jest.fn().mockImplementation(async (sql: string, params?: any[]) => {
        if (sql.includes('jupeb_biometric_captures')) {
          // 0 biometric captures
          return [{ count: 0 }];
        }
        if (sql.includes('SELECT p.profile_photo_url')) {
          // Has photo in profiles table
          return [{ profile_photo_url: 'https://cdn.example.com/photo.jpg', nin_photo_url: null, nin_photo: null }];
        }
        return [];
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        { provide: RegistrationRepository, useValue: mockRegRepo },
        { provide: RegistrationDocumentRepository, useValue: { findByRegistrationId: jest.fn().mockResolvedValue([]) } },
        { provide: RegistrationStatusHistoryRepository, useValue: mockHistoryRepo },
        {
          provide: RegistrationStateService,
          useValue: {
            canTransition: (from: string, to: string) => {
              if (from === RegistrationStatus.PENDING_INSTITUTION_REVIEW && to === RegistrationStatus.APPROVED) {
                return true;
              }
              return false;
            },
          },
        },
        { provide: RegistrationKpiService, useValue: {} },
        { provide: RegistrationEventsService, useValue: mockEventsService },
        { provide: RegistrationFormPdfService, useValue: {} },
        { provide: CandidateSyncQueueService, useValue: {} },
        {
          provide: InstitutionUserScopeService,
          useValue: { assertUniversityAccess: jest.fn().mockResolvedValue(true) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
        {
          provide: LoggerFactory,
          useValue: {
            create: () => ({
              log: jest.fn(),
              warn: jest.fn(),
              error: jest.fn(),
              debug: jest.fn(),
            }),
          },
        },
        {
          provide: InstitutionRegistrationLockService,
          useValue: { assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: ConfigService, useValue: { get: jest.fn() } },
        { provide: Reflector, useValue: { getAllAndOverride: jest.fn() } },
      ],
    }).compile();

    registrationService = module.get<RegistrationService>(RegistrationService);
    registrationController = new RegistrationController(registrationService, {} as any);
  });

  it('approves registration when candidate has profile/NIN photo even without biometric scanner capture', async () => {
    const result = await registrationService.batchUpdateRegistrationStatus(
      {
        ids: [candidateRegId],
        action: 'approve',
        reason: '',
      },
      'admin-1',
    );

    expect(result.accepted_count).toBe(1);
    expect(result.rejected_count).toBe(0);
    expect(result.accepted[0].id).toBe(candidateRegId);
    expect(mockRegRepo.setStatus).toHaveBeenCalledWith(
      candidateRegId,
      RegistrationStatus.APPROVED,
      undefined,
      'admin-1',
    );
  });

  it('rejects registration when candidate has neither biometrics, skip, nor photo', async () => {
    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('jupeb_biometric_captures')) return [{ count: 0 }];
      if (sql.includes('SELECT p.profile_photo_url')) return [{ profile_photo_url: null, nin_photo_url: null, nin_photo: null }];
      return [];
    });

    const result = await registrationService.batchUpdateRegistrationStatus(
      {
        ids: [candidateRegId],
        action: 'approve',
      },
      'admin-1',
    );

    expect(result.accepted_count).toBe(0);
    expect(result.rejected_count).toBe(1);
    expect(result.rejected[0].error_code).toBe('biometrics_incomplete');
  });

  it('throws UnprocessableEntityException on invalid action', async () => {
    await expect(
      registrationService.batchUpdateRegistrationStatus(
        {
          ids: [candidateRegId],
          action: 'archive',
        },
        'admin-1',
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('controller throws UnprocessableEntityException when all batch items fail', async () => {
    mockDataSource.query.mockImplementation(async (sql: string) => {
      if (sql.includes('jupeb_biometric_captures')) return [{ count: 0 }];
      if (sql.includes('SELECT p.profile_photo_url')) return [{ profile_photo_url: null, nin_photo_url: null, nin_photo: null }];
      return [];
    });

    await expect(
      registrationController.batchUpdateRegistrationStatus(
        {
          ids: [candidateRegId],
          action: 'approve',
        },
        { user: { id: 'admin-1' } },
      ),
    ).rejects.toThrow(UnprocessableEntityException);
  });
});
