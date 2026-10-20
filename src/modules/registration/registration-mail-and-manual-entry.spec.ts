import { RegistrationMailListener } from './listeners/registration-mail.listener';
import {
  MatricAssignedEvent,
  RegistrationStatusChangeEvent,
} from './constants/registration-events.enum';
import { RegistrationStatus } from './entities/registration.entity';
import { RegistrationNextStep } from '../../shared/enums';
import { AuthService } from '../auth';

describe('Registration Mail Dispatch & Manual Entry Integration Tests', () => {
  describe('RegistrationMailListener', () => {
    let listener: RegistrationMailListener;
    let mockDataSource: any;
    let mockMailService: any;
    let mockConfigService: any;

    beforeEach(() => {
      mockDataSource = {
        query: jest.fn(),
      };
      mockMailService = {
        sendCodeIssuedEmail: jest.fn().mockResolvedValue('msg-1'),
        sendMatricAssignedEmail: jest.fn().mockResolvedValue('msg-2'),
        sendRegistrationApprovedEmail: jest.fn().mockResolvedValue('msg-3'),
        sendRegistrationRejectedEmail: jest.fn().mockResolvedValue('msg-4'),
        sendRegistrationWithdrawnEmail: jest.fn().mockResolvedValue('msg-5'),
        sendRegistrationDeletedEmail: jest.fn().mockResolvedValue('msg-6'),
        sendRegistrationUnlockedEmail: jest.fn().mockResolvedValue('msg-7'),
        sendRegistrationLockedEmail: jest.fn().mockResolvedValue('msg-8'),
      };
      mockConfigService = {
        get: jest.fn().mockImplementation((key, defaultVal) => {
          if (key === 'FRONTEND_URL') return 'https://portal.example.com';
          return defaultVal;
        }),
      };

      listener = new RegistrationMailListener(
        mockDataSource,
        mockMailService,
        mockConfigService,
      );
    });

    it('dispatches matric assigned email on MATRIC_ASSIGNED event', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-1',
          jupeb_candidate_number: '26JU0001',
          user_email: 'candidate@example.com',
          profile_first_name: 'Segun',
          university_name: 'University of Lagos',
        },
      ]);

      const event: MatricAssignedEvent = {
        registrationId: 'reg-1',
        candidateNumber: '26JU0001',
      };

      await listener.handleMatricAssigned(event);

      expect(mockMailService.sendMatricAssignedEmail).toHaveBeenCalledWith(
        'candidate@example.com',
        expect.objectContaining({
          firstName: 'Segun',
          universityName: 'University of Lagos',
          candidateNumber: '26JU0001',
          dashboardUrl: 'https://portal.example.com/dashboard',
          email: 'candidate@example.com',
        }),
      );
    });

    it('dispatches approved email on APPROVED event', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-2',
          jupeb_candidate_number: '26JU0002',
          user_email: 'approved@example.com',
          profile_first_name: 'Amaka',
          university_name: 'University of Ibadan',
        },
      ]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-2',
        candidateNumber: '26JU0002',
      };

      await listener.handleApproved(event);

      expect(mockMailService.sendRegistrationApprovedEmail).toHaveBeenCalledWith(
        'approved@example.com',
        expect.objectContaining({
          firstName: 'Amaka',
          universityName: 'University of Ibadan',
          candidateNumber: '26JU0002',
          dashboardUrl: 'https://portal.example.com/dashboard',
        }),
      );
    });

    it('dispatches rejected email on REJECTED event with reason', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-3',
          user_email: 'rejected@example.com',
          profile_first_name: 'Tunde',
          university_name: 'Obafemi Awolowo University',
        },
      ]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-3',
        reason: 'O-Level subject grades incomplete',
      };

      await listener.handleRejected(event);

      expect(mockMailService.sendRegistrationRejectedEmail).toHaveBeenCalledWith(
        'rejected@example.com',
        expect.objectContaining({
          firstName: 'Tunde',
          universityName: 'Obafemi Awolowo University',
          reason: 'O-Level subject grades incomplete',
          dashboardUrl: 'https://portal.example.com/dashboard',
        }),
      );
    });

    it('dispatches withdrawn email on WITHDRAWN event', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-4',
          user_email: 'withdrawn@example.com',
          profile_first_name: 'Ngozi',
          university_name: 'University of Nigeria, Nsukka',
        },
      ]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-4',
        reason: 'Candidate request',
      };

      await listener.handleWithdrawn(event);

      expect(mockMailService.sendRegistrationWithdrawnEmail).toHaveBeenCalledWith(
        'withdrawn@example.com',
        expect.objectContaining({
          firstName: 'Ngozi',
          universityName: 'University of Nigeria, Nsukka',
          dashboardUrl: 'https://portal.example.com/dashboard',
        }),
      );
    });

    it('dispatches deleted email using event payload fallback when row is already deleted', async () => {
      // Row not in db because hard deleted
      mockDataSource.query.mockResolvedValueOnce([]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-5',
        email: 'deleted@example.com',
        firstName: 'Emeka',
        universityName: 'University of Benin',
        reason: 'Cancelled registration',
      };

      await listener.handleDeleted(event);

      expect(mockMailService.sendRegistrationDeletedEmail).toHaveBeenCalledWith(
        'deleted@example.com',
        expect.objectContaining({
          firstName: 'Emeka',
          universityName: 'University of Benin',
          dashboardUrl: 'https://portal.example.com/auth/login',
        }),
      );
    });

    it('dispatches unlocked email on UNLOCKED event', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-6',
          user_email: 'unlocked@example.com',
          profile_first_name: 'Chidi',
          university_name: 'Federal University of Technology, Akure',
        },
      ]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-6',
      };

      await listener.handleUnlocked(event);

      expect(mockMailService.sendRegistrationUnlockedEmail).toHaveBeenCalledWith(
        'unlocked@example.com',
        expect.objectContaining({
          firstName: 'Chidi',
          universityName: 'Federal University of Technology, Akure',
          dashboardUrl: 'https://portal.example.com/dashboard',
        }),
      );
    });

    it('dispatches locked email on LOCKED event', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        {
          id: 'reg-7',
          user_email: 'locked@example.com',
          profile_first_name: 'Fatima',
          university_name: 'Ahmadu Bello University',
        },
      ]);

      const event: RegistrationStatusChangeEvent = {
        registrationId: 'reg-7',
        reason: 'Session deadline passed',
      };

      await listener.handleLocked(event);

      expect(mockMailService.sendRegistrationLockedEmail).toHaveBeenCalledWith(
        'locked@example.com',
        expect.objectContaining({
          firstName: 'Fatima',
          universityName: 'Ahmadu Bello University',
          dashboardUrl: 'https://portal.example.com/dashboard',
        }),
      );
    });
  });

  describe('AuthService Onboarding Step with Manual Results', () => {
    it('recognizes manual results as satisfying document completion during onboarding', () => {
      const reg = { status: RegistrationStatus.PENDING_DOCUMENTS };
      const docsStatsWithManualResults = {
        uploaded: 0,
        required: 1,
        has_manual_results: true,
      };
      const bioStatsCaptured = {
        captured: 1,
      };

      const nextStep = AuthService._computeNextStep(
        reg,
        docsStatsWithManualResults,
        bioStatsCaptured,
      );

      expect(nextStep).toBe(RegistrationNextStep.SUBMIT_FOR_REVIEW);
    });
  });

  describe('RegistrationService Submission Readiness with Manual Results', () => {
    it('allows submission when candidate has manual result entries and 0 uploaded documents', async () => {
      const { RegistrationService } = require('./services/registration.service');
      const mockRegRepo = {
        findByUserId: jest.fn().mockResolvedValue({
          id: 'reg-preview-1',
          userId: 'user-preview-1',
          subjectCombinationId: 'sc-1',
        }),
      };
      const mockDocRepo = {
        findByRegistrationId: jest.fn().mockResolvedValue([]), // 0 uploaded documents
      };
      const mockDataSource = {
        query: jest.fn().mockImplementation((queryStr: string) => {
          if (queryStr.includes('jupeb_result_entries')) {
            return Promise.resolve([{ count: 5 }]); // 5 manual result entries!
          }
          if (queryStr.includes('jupeb_biometric_captures')) {
            return Promise.resolve([{ count: 1 }]);
          }
          return Promise.resolve([]);
        }),
      };
      const mockLoggerFactory = {
        create: () => ({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }),
      };

      const service = new RegistrationService(
        mockRegRepo,
        mockDocRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { emit: jest.fn() } as any,
        mockDataSource as any,
        mockLoggerFactory as any,
        { assertRegistrationAllowed: jest.fn() } as any,
      );

      // Mock getRegistrationById and restoreSubjectCombinationFromNinIntake
      jest.spyOn(service, 'restoreSubjectCombinationFromNinIntake').mockResolvedValue(undefined);
      jest.spyOn(service, 'getRegistrationById').mockResolvedValue({
        first_name: 'David',
        last_name: 'Adeleke',
        display_name: 'David Adeleke',
        email: 'david@example.com',
        subject_combination: { id: 'sc-1' },
        candidate: { photo_url: 'https://example.com/photo.jpg' },
      });

      const preview = await service.getSubmissionPreview('user-preview-1');

      expect(preview.documents_completed).toBe(true);
      expect(preview.missing_items).not.toContain('Supporting documents');
      expect(preview.can_submit).toBe(true);
    });

    it('flags supporting documents as missing when candidate has 0 documents and 0 result entries', async () => {
      const { RegistrationService } = require('./services/registration.service');
      const mockRegRepo = {
        findByUserId: jest.fn().mockResolvedValue({
          id: 'reg-preview-2',
          userId: 'user-preview-2',
          subjectCombinationId: 'sc-2',
        }),
      };
      const mockDocRepo = {
        findByRegistrationId: jest.fn().mockResolvedValue([]), // 0 uploaded documents
      };
      const mockDataSource = {
        query: jest.fn().mockImplementation((queryStr: string) => {
          if (queryStr.includes('jupeb_result_entries')) {
            return Promise.resolve([{ count: 0 }]); // 0 entries
          }
          if (queryStr.includes('jupeb_biometric_captures')) {
            return Promise.resolve([{ count: 1 }]);
          }
          return Promise.resolve([]);
        }),
      };
      const mockLoggerFactory = {
        create: () => ({
          log: jest.fn(),
          warn: jest.fn(),
          error: jest.fn(),
        }),
      };

      const service = new RegistrationService(
        mockRegRepo,
        mockDocRepo,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        {} as any,
        { emit: jest.fn() } as any,
        mockDataSource as any,
        mockLoggerFactory as any,
        { assertRegistrationAllowed: jest.fn() } as any,
      );

      jest.spyOn(service, 'restoreSubjectCombinationFromNinIntake').mockResolvedValue(undefined);
      jest.spyOn(service, 'getRegistrationById').mockResolvedValue({
        first_name: 'Tiwa',
        last_name: 'Savage',
        display_name: 'Tiwa Savage',
        email: 'tiwa@example.com',
        subject_combination: { id: 'sc-2' },
        candidate: { photo_url: 'https://example.com/photo.jpg' },
      });

      const preview = await service.getSubmissionPreview('user-preview-2');

      expect(preview.documents_completed).toBe(false);
      expect(preview.missing_items).toContain('Supporting documents');
      expect(preview.can_submit).toBe(false);
    });
  });
});
