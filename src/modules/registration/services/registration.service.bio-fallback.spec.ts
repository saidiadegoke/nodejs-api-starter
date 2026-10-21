/**
 * RegistrationService.getRegistrationById — bio fallback to NIN intake.
 *
 * Bulk uploads only capture what the spreadsheet holds. Fields with no
 * provider payload must resolve from the verification intake_payload
 * instead of surfacing as null ("N/A" upstream).
 *
 * Pure unit test — collaborators mocked, no DB.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { LoggerFactory } from '../../../logger';
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

const REG_ID = '123e4567-e89b-12d3-a456-426614174000';

const detailRow = {
  id: REG_ID,
  user_id: null,
  university_id: 'uni-1',
  session_id: 'sess-1',
  subject_combination_id: null,
  provisional_candidate_code: 'TST0006',
  institution_issued_code: 'ABC123',
  jupeb_candidate_number: null,
  first_name: null,
  last_name: null,
  display_name: null,
  gender: null,
  date_of_birth: null,
  profile_photo_url: null,
  residential_address: null,
  state_of_origin: null,
  lga: null,
  place_of_birth: null,
  email: null,
  phone: null,
  email_verified: null,
  phone_verified: null,
  last_login_at: null,
  nin_id: 'nv-1',
  nin_last4: '5660',
  nin_status: 'verified',
  nin_payload: { first_name: 'Jane', last_name: 'Doe' },
  nin_intake: {
    first_name: 'Jane',
    last_name: 'Doe',
    gender: 'female',
    date_of_birth: '2000-01-01',
    residential_address: '12 Main St',
    state_of_origin: 'Lagos',
    lga: 'Ikeja',
    place_of_birth: 'Lagos',
    email: 'jane@x.com',
    phone: '08010000001',
  },
  country: null,
};

describe('RegistrationService.getRegistrationById bio fallbacks', () => {
  let service: RegistrationService;
  let dataSourceQuery: jest.Mock;

  beforeEach(async () => {
    dataSourceQuery = jest.fn(async (sql: string) => {
      if (sql.includes('nin_payload')) return [{ ...detailRow }];
      if (sql.includes('jupeb_next_of_kin')) return [];
      if (sql.includes('jupeb_result_entries')) return [];
      if (sql.includes('jupeb_biometric_captures')) return [];
      if (sql.includes('combination_items')) return [];
      if (sql.includes('FROM files WHERE id')) return [];
      return [];
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RegistrationService,
        {
          provide: RegistrationRepository,
          useValue: {
            findById: jest.fn().mockResolvedValue({ id: REG_ID, universityId: 'uni-1' }),
          },
        },
        { provide: RegistrationDocumentRepository, useValue: { findByRegistrationId: jest.fn().mockResolvedValue([]) } },
        { provide: RegistrationStatusHistoryRepository, useValue: { findByRegistrationId: jest.fn().mockResolvedValue([]) } },
        { provide: RegistrationStateService, useValue: {} },
        { provide: RegistrationKpiService, useValue: {} },
        { provide: RegistrationEventsService, useValue: {} },
        { provide: RegistrationFormPdfService, useValue: {} },
        { provide: CandidateSyncQueueService, useValue: {} },
        {
          provide: InstitutionUserScopeService,
          useValue: { assertUniversityAccess: jest.fn().mockResolvedValue(undefined) },
        },
        { provide: EventEmitter2, useValue: { emit: jest.fn() } },
        { provide: DataSource, useValue: { query: dataSourceQuery } },
        {
          provide: LoggerFactory,
          useValue: {
            create: () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
          },
        },
        {
          provide: InstitutionRegistrationLockService,
          useValue: { assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get<RegistrationService>(RegistrationService);
  });

  test('resolves bio fields from intake when provider payload is thin', async () => {
    const out: any = await service.getRegistrationById(REG_ID);

    expect(out.gender).toBe('female');
    expect(out.date_of_birth).toBe('2000-01-01');
    expect(out.residential_address).toBe('12 Main St');
    expect(out.state_of_origin).toBe('Lagos');
    expect(out.lga).toBe('Ikeja');
    expect(out.place_of_birth).toBe('Lagos');
    expect(out.email).toBe('jane@x.com');
    expect(out.phone).toBe('08010000001');
    expect(out.display_name).toBe('Jane Doe');
    expect(out.first_name).toBe('Jane');
  });
});
