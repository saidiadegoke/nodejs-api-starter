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
import { InstitutionRegistrationLockService } from '@modules/sessions';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../logger';

describe('Next of Kin and Captured Photo in Registration Details, Lists, and Submission Preview', () => {
  let registrationService: RegistrationService;
  let mockRegRepo: any;
  let mockDocRepo: any;
  let mockDataSource: any;

  beforeEach(async () => {
    mockRegRepo = {
      findAllPaginated: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      updateById: jest.fn(),
    };

    mockDocRepo = {
      findByRegistrationId: jest.fn().mockResolvedValue([]),
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
        { provide: RegistrationDocumentRepository, useValue: mockDocRepo },
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
        {
          provide: InstitutionRegistrationLockService,
          useValue: { assertRegistrationAllowed: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    registrationService = module.get<RegistrationService>(RegistrationService);
  });

  it('getRegistrationById returns next_of_kin, face_photo_url, and captured_photo_url', async () => {
    const regId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    mockRegRepo.findById.mockResolvedValue({
      id: regId,
      universityId: 'uni-1',
      userId: 'user-1',
      subjectCombinationId: 'sc-1',
    });

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('FROM jupeb_registrations')) {
        return Promise.resolve([
          {
            id: regId,
            user_id: 'user-1',
            first_name: 'Jane',
            last_name: 'Doe',
            display_name: 'Jane Doe',
            profile_photo_url: 'https://example.com/profile.jpg',
            email: 'jane@example.com',
            status: 'pending_institution_review',
          },
        ]);
      }
      if (sql.includes('FROM jupeb_next_of_kin')) {
        return Promise.resolve([
          {
            id: 'nok-1',
            registration_id: regId,
            name: 'Dr. John Doe',
            relationship: 'father',
            phone: '08012345678',
            email: 'john@example.com',
            address: 'Lagos',
            source: 'institution',
          },
        ]);
      }
      if (sql.includes('FROM jupeb_biometric_captures')) {
        return Promise.resolve([
          {
            id: 'bio-1',
            capture_type: 'face',
            file_url: 'https://example.com/captured-face.jpg',
          },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await registrationService.getRegistrationById(regId, 'admin-1');

    expect(result.next_of_kin).toBeDefined();
    expect(result.next_of_kin.name).toBe('Dr. John Doe');
    expect(result.candidate.next_of_kin).toBeDefined();
    expect(result.candidate.next_of_kin.name).toBe('Dr. John Doe');

    expect(result.captured_photo_url).toBe('https://example.com/captured-face.jpg');
    expect(result.face_photo_url).toBe('https://example.com/captured-face.jpg');
    expect(result.candidate.captured_photo_url).toBe('https://example.com/captured-face.jpg');
    expect(result.candidate.photo_url).toBe('https://example.com/captured-face.jpg');
  });

  it('listRegistrations enriches rows with next_of_kin and captured face photo', async () => {
    mockRegRepo.findAllPaginated.mockResolvedValue({
      rows: [
        {
          id: 'reg-list-1',
          user_id: 'user-1',
          first_name: 'Ada',
          last_name: 'Lovelace',
          display_name: 'Ada Lovelace',
          captured_photo_url: 'https://example.com/biometric-face.jpg',
          profile_photo_url: 'https://example.com/biometric-face.jpg',
          next_of_kin: {
            name: 'Lord Byron',
            relationship: 'father',
            phone: '08099998888',
          },
          has_biometrics: true,
          status: 'pending_institution_review',
        },
      ],
      total: 1,
    });

    const result = await registrationService.listRegistrations({}, 'admin-1');
    const row = result.rows[0];

    expect(row.next_of_kin).toBeDefined();
    expect(row.next_of_kin.name).toBe('Lord Byron');
    expect(row.candidate.next_of_kin).toBeDefined();
    expect(row.candidate.next_of_kin.name).toBe('Lord Byron');

    expect(row.captured_photo_url).toBe('https://example.com/biometric-face.jpg');
    expect(row.candidate.captured_photo_url).toBe('https://example.com/biometric-face.jpg');
  });

  it('getSubmissionPreview includes next_of_kin and captured photo along with checklist flags', async () => {
    const regId = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
    mockRegRepo.findByUserId.mockResolvedValue({
      id: regId,
      userId: 'user-preview-1',
      subjectCombinationId: 'sc-1',
    });

    jest.spyOn(registrationService as any, 'restoreSubjectCombinationFromNinIntake').mockResolvedValue(undefined);
    jest.spyOn(registrationService, 'getRegistrationById').mockResolvedValue({
      id: regId,
      first_name: 'Ada',
      last_name: 'Lovelace',
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      captured_photo_url: 'https://example.com/face.jpg',
      profile_photo_url: 'https://example.com/face.jpg',
      face_photo_url: 'https://example.com/face.jpg',
      next_of_kin: {
        name: 'Lord Byron',
        relationship: 'father',
        phone: '08099998888',
      },
      candidate: {
        display_name: 'Ada Lovelace',
        email: 'ada@example.com',
        photo_url: 'https://example.com/face.jpg',
        captured_photo_url: 'https://example.com/face.jpg',
      },
      subject_combination: { id: 'sc-1' },
      documents: [{ id: 'doc-1' }],
    } as any);

    mockDataSource.query.mockImplementation((sql: string) => {
      if (sql.includes('jupeb_result_entries')) {
        return Promise.resolve([{ count: 0 }]);
      }
      if (sql.includes('jupeb_biometric_captures')) {
        return Promise.resolve([{ count: 1 }]);
      }
      return Promise.resolve([]);
    });

    const preview: any = await registrationService.getSubmissionPreview('user-preview-1');

    expect(preview.next_of_kin).toBeDefined();
    expect(preview.next_of_kin.name).toBe('Lord Byron');
    expect(preview.captured_photo_url).toBe('https://example.com/face.jpg');
    expect(preview.profile_completed).toBe(true);
    expect(preview.biometrics_completed).toBe(true);
    expect(preview.can_submit).toBe(true);
  });
});
