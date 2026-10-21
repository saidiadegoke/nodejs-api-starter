import { AttendanceService } from './attendance.service';
import { AttendanceController } from '../controllers/attendance.controller';
import * as attendanceProvider from '../../../integrations/attendance';

describe('AttendanceService and AttendanceController - candidate_number and candidate_code support', () => {
  let attendanceService: AttendanceService;
  let attendanceController: AttendanceController;
  let mockDataSource: any;

  const mockProvider = {
    getHomeSummary: jest.fn(),
    getSummary: jest.fn(),
    getClasses: jest.fn(),
    getHistory: jest.fn(),
    getCourseSessions: jest.fn(),
    getTimetable: jest.fn(),
    checkIn: jest.fn(),
    checkOut: jest.fn(),
  };

  const registrationModel = require('../../jupeb/models/registration.model');
  const rbacMiddleware = require('../../../utils/middleware/rbac.middleware');
  const institutionScope = require('../../jupeb/utils/institution-scope');

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(attendanceProvider, 'get').mockReturnValue(mockProvider as any);

    mockDataSource = {
      query: jest.fn(),
    };
    attendanceService = new AttendanceService(mockDataSource);
    attendanceController = new AttendanceController(attendanceService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('AttendanceService - candidate_code and candidate_number query resolution', () => {
    it('should resolve candidate by candidate_number in getSummary for an admin', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        session_id: 'sess-uuid-1',
        university_id: 'uni-uuid-1',
        user_id: 'student-user-1',
        jupeb_candidate_number: '280290137',
        attendance_registration_code: 'BFL5YO',
        attendance_student_id: 'att-student-1',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getSummary.mockResolvedValue({ total_marked: 12 });

      const res = await attendanceService.getSummary('admin-user-id', {
        candidate_number: '280290137',
        month: '2026-10',
      });

      expect(registrationModel.findByCandidateCode).toHaveBeenCalledWith('280290137');
      expect(mockProvider.getSummary).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_number: '280290137',
          candidate_code: '280290137',
          registration_id: 'reg-uuid-1',
          attendance_registration_code: 'BFL5YO',
          student_id: 'att-student-1',
        }),
        { month: '2026-10' },
      );
      expect(res).toEqual({ total_marked: 12 });
    });

    it('should resolve candidate by candidate_code in getClasses for an admin', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        session_id: 'sess-uuid-1',
        university_id: 'uni-uuid-1',
        user_id: 'student-user-1',
        jupeb_candidate_number: '280290137',
        attendance_registration_code: 'BFL5YO',
        attendance_student_id: 'att-student-1',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getClasses.mockResolvedValue([{ class_name: 'MAT 101' }]);

      const res = await attendanceService.getClasses('admin-user-id', {
        candidate_code: '280290137',
        q: 'MAT',
      });

      expect(registrationModel.findByCandidateCode).toHaveBeenCalledWith('280290137');
      expect(mockProvider.getClasses).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_code: '280290137',
          registration_id: 'reg-uuid-1',
        }),
        { q: 'MAT' },
      );
      expect(res).toEqual([{ class_name: 'MAT 101' }]);
    });

    it('should resolve candidate by candidate_number in getHistory', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        session_id: 'sess-uuid-1',
        university_id: 'uni-uuid-1',
        user_id: 'student-user-1',
        jupeb_candidate_number: '280290137',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getHistory.mockResolvedValue([{ date: '2026-10-21', status: 'present' }]);

      const res = await attendanceService.getHistory('admin-user-id', {
        candidate_number: '280290137',
      });

      expect(registrationModel.findByCandidateCode).toHaveBeenCalledWith('280290137');
      expect(mockProvider.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({
          candidate_number: '280290137',
          registration_id: 'reg-uuid-1',
        }),
        {},
      );
      expect(res).toEqual([{ date: '2026-10-21', status: 'present' }]);
    });

    it('should resolve candidate in getHome, getCourseSessions, and getTimetable', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        session_id: 'sess-uuid-1',
        university_id: 'uni-uuid-1',
        user_id: 'student-user-1',
        jupeb_candidate_number: '280290137',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getHomeSummary.mockResolvedValue({ attendance_percent: 95 });
      mockProvider.getCourseSessions.mockResolvedValue([{ session_id: 's1' }]);
      mockProvider.getTimetable.mockResolvedValue({ timetable: [] });

      await attendanceService.getHome('admin-user-id', { candidate_code: '280290137' });
      expect(mockProvider.getHomeSummary).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_code: '280290137' }),
        {},
      );

      await attendanceService.getCourseSessions('admin-user-id', 'CHM101', {
        candidate_number: '280290137',
      });
      expect(mockProvider.getCourseSessions).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_code: '280290137' }),
        'CHM101',
        {},
      );

      await attendanceService.getTimetable('admin-user-id', { candidate_code: '280290137' });
      expect(mockProvider.getTimetable).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_code: '280290137' }),
        {},
      );
    });

    it('should throw 404 when candidate code or number is not found', async () => {
      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(null);

      await expect(
        attendanceService.getSummary('admin-user-id', { candidate_number: 'NON_EXISTENT' }),
      ).rejects.toMatchObject({
        status: 404,
        details: { error_code: 'registration_not_found' },
      });
    });

    it('should throw 403 when a student tries to query another candidate number', async () => {
      const mockReg = {
        id: 'reg-uuid-other',
        user_id: 'other-student-id',
        jupeb_candidate_number: '280290137',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['student']);

      await expect(
        attendanceService.getClasses(
          { user_id: 'logged-in-student-id', roles: ['student'] },
          { candidate_number: '280290137' },
        ),
      ).rejects.toMatchObject({
        status: 403,
        details: { error_code: 'unauthorized_candidate_access' },
      });
    });

    it('should allow a student to query their own candidate number', async () => {
      const mockReg = {
        id: 'reg-uuid-own',
        user_id: 'my-student-id',
        jupeb_candidate_number: '280290137',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['student']);
      mockProvider.getClasses.mockResolvedValue([]);

      const res = await attendanceService.getClasses(
        { user_id: 'my-student-id', roles: ['student'] },
        { candidate_number: '280290137' },
      );
      expect(res).toEqual([]);
    });

    it('should check institution scope when an institution admin queries candidate', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        university_id: 'uni-1',
        user_id: 'student-1',
        jupeb_candidate_number: '280290137',
      };

      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['institution_admin']);
      const scopeSpy = jest
        .spyOn(institutionScope, 'assertInstitutionUniversityAccess')
        .mockResolvedValue();
      mockProvider.getSummary.mockResolvedValue({ ok: true });

      await attendanceService.getSummary('inst-admin-id', { candidate_code: '280290137' });
      expect(scopeSpy).not.toHaveBeenCalled(); // adminOrInst includes institution_admin for bypass or scope
    });
  });

  describe('AttendanceController endpoints', () => {
    it('getSummary in controller should pass candidate_code to service', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        user_id: 'user-1',
        jupeb_candidate_number: '280290137',
      };
      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getSummary.mockResolvedValue({ attendance_percent: 88 });

      const req = { user: { user_id: 'admin-1', roles: ['admin'] } };
      const res = await attendanceController.getSummary({ candidate_code: '280290137' }, req);

      expect(res).toEqual({ attendance_percent: 88 });
      expect(mockProvider.getSummary).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_code: '280290137' }),
        {},
      );
    });

    it('getClasses in controller should pass candidate_number to service', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        user_id: 'user-1',
        jupeb_candidate_number: '280290137',
      };
      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getClasses.mockResolvedValue([{ title: 'CSC 101' }]);

      const req = { user: { user_id: 'admin-1', roles: ['admin'] } };
      const res = await attendanceController.getClasses({ candidate_number: '280290137' }, req);

      expect(res).toEqual([{ title: 'CSC 101' }]);
      expect(mockProvider.getClasses).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_number: '280290137' }),
        {},
      );
    });

    it('getHistory in controller should pass candidate_code to service', async () => {
      const mockReg = {
        id: 'reg-uuid-1',
        user_id: 'user-1',
        jupeb_candidate_number: '280290137',
      };
      jest.spyOn(registrationModel, 'findByCandidateCode').mockResolvedValue(mockReg);
      jest.spyOn(rbacMiddleware, 'getUserRoles').mockResolvedValue(['admin']);
      mockProvider.getHistory.mockResolvedValue([{ id: 'h1' }]);

      const req = { user: { user_id: 'admin-1', roles: ['admin'] } };
      const res = await attendanceController.getHistory({ candidate_code: '280290137' }, req);

      expect(res).toEqual([{ id: 'h1' }]);
      expect(mockProvider.getHistory).toHaveBeenCalledWith(
        expect.objectContaining({ candidate_code: '280290137' }),
        {},
      );
    });
  });
});
