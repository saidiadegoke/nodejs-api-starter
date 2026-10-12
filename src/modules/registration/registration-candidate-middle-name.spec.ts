import { Test, TestingModule } from '@nestjs/testing';
import { RegistrationService } from './services/registration.service';
import { RegistrationRepository } from './repositories/registration.repository';
import { RegistrationDocumentRepository } from './repositories/registration-document.repository';
import { RegistrationStatusHistoryRepository } from './repositories/registration-status-history.repository';
import { RegistrationStateService } from './services/registration-state.service';
import { RegistrationKpiService } from './services/registration-kpi.service';
import { RegistrationEventsService } from './services/registration-events.service';
import { RegistrationFormPdfService } from './services/registration-form-pdf.service';
import { CandidateSyncQueueService } from '@modules/sync';
import { InstitutionUserScopeService } from './services/institution-user-scope.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../logger';

describe('Candidate Middle Name Handling in Registrations', () => {
  let registrationService: RegistrationService;
  let mockRegRepo: any;
  let mockDataSource: any;

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
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: mockDataSource },
        { provide: LoggerFactory, useValue: mockLoggerFactory },
      ],
    }).compile();

    registrationService = module.get<RegistrationService>(RegistrationService);
  });

  it('returns candidate middle_name, display_name, and candidate.middle_name in listRegistrations when code is generated (pre-onboarding)', async () => {
    // Before candidate onboards, user_id is null, profile is null, but NIN was verified
    mockRegRepo.findAllPaginated.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 'reg-uuid-1',
          session_id: 'session-1',
          university_id: 'uni-1',
          user_id: null,
          status: 'code_issued',
          provisional_candidate_code: '4300018',
          jupeb_candidate_number: null,
          institution_issued_code: 'RPWZZZ',
          first_name: 'QUADRI',
          middle_name: 'ADEYEMI',
          last_name: 'SIKIRU',
          display_name: 'QUADRI ADEYEMI SIKIRU',
          profile_photo_url: 'https://example.com/photo.jpg',
          email: 'quadrisikiru88@gmail.com',
          phone: '08136619009',
          nin_last4: '5660',
          has_biometrics: false,
        },
      ],
    });

    const result = await registrationService.listRegistrations({
      page: 1,
      limit: 20,
    } as any, 'user-admin');

    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    expect(row.first_name).toBe('QUADRI');
    expect(row.middle_name).toBe('ADEYEMI');
    expect(row.last_name).toBe('SIKIRU');
    expect(row.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.full_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.name).toBe('QUADRI ADEYEMI SIKIRU');

    // Nested candidate object
    expect(row.candidate).toBeDefined();
    expect(row.candidate.first_name).toBe('QUADRI');
    expect(row.candidate.middle_name).toBe('ADEYEMI');
    expect(row.candidate.last_name).toBe('SIKIRU');
    expect(row.candidate.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.candidate.full_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.candidate.name).toBe('QUADRI ADEYEMI SIKIRU');
  });

  it('restores middle_name in display_name and full_name when candidate onboarded with legacy display_name (missing middle name)', async () => {
    // When candidate onboarded previously, profile display_name was saved as "QUADRI SIKIRU"
    mockRegRepo.findAllPaginated.mockResolvedValue({
      total: 1,
      rows: [
        {
          id: 'reg-uuid-2',
          session_id: 'session-1',
          university_id: 'uni-1',
          user_id: 'user-cand-1',
          status: 'approved',
          provisional_candidate_code: '4300018',
          jupeb_candidate_number: '284300001',
          institution_issued_code: 'RPWZZZ',
          first_name: 'QUADRI',
          middle_name: 'ADEYEMI',
          last_name: 'SIKIRU',
          display_name: 'QUADRI SIKIRU', // Legacy display_name that lacked middle name
          profile_photo_url: 'https://example.com/photo.jpg',
          email: 'quadrisikiru88@gmail.com',
          phone: '08136619009',
          nin_last4: '5660',
          has_biometrics: true,
        },
      ],
    });

    const result = await registrationService.listRegistrations({
      page: 1,
      limit: 20,
    } as any, 'user-admin');

    const row = result.rows[0];
    expect(row.middle_name).toBe('ADEYEMI');
    // enrichRegistrationRow inserts middle_name into display_name when middle_name was omitted
    expect(row.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.full_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.candidate.middle_name).toBe('ADEYEMI');
    expect(row.candidate.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(row.candidate.full_name).toBe('QUADRI ADEYEMI SIKIRU');
  });

  it('includes candidate middle_name in getRegistrationById details', async () => {
    const regId = 'e7b30682-f9e8-4b9f-b6f3-c6c5bd9e76b0';
    mockRegRepo.findById.mockResolvedValue({
      id: regId,
      universityId: 'uni-1',
      subjectCombinationId: 'sc-1',
      provisionalCandidateCode: '4300018',
    });

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM jupeb_registrations r')) {
        return Promise.resolve([
          {
            id: regId,
            university_id: 'uni-1',
            first_name: 'QUADRI',
            last_name: 'SIKIRU',
            display_name: 'QUADRI SIKIRU',
            nin_status: 'verified',
            nin_payload: {
              first_name: 'QUADRI',
              middle_name: 'ADEYEMI',
              last_name: 'SIKIRU',
            },
            nin_intake: {},
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const detail = await registrationService.getRegistrationById(regId, 'user-admin');

    expect(detail.first_name).toBe('QUADRI');
    expect(detail.middle_name).toBe('ADEYEMI');
    expect(detail.last_name).toBe('SIKIRU');
    expect(detail.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(detail.full_name).toBe('QUADRI ADEYEMI SIKIRU');

    expect(detail.candidate).toBeDefined();
    expect(detail.candidate.first_name).toBe('QUADRI');
    expect(detail.candidate.middle_name).toBe('ADEYEMI');
    expect(detail.candidate.last_name).toBe('SIKIRU');
    expect(detail.candidate.display_name).toBe('QUADRI ADEYEMI SIKIRU');
    expect(detail.candidate.full_name).toBe('QUADRI ADEYEMI SIKIRU');
  });
});
