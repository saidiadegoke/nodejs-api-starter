const attendanceProviders = require('../modules/integrations/attendance');
const httpProvider = require('../modules/integrations/attendance/http.provider');
const AttendanceService = require('../modules/attendance/services/attendance.service');
const catalogService = require('../modules/jupeb/services/catalog.service');
const axios = require('axios');

jest.mock('axios');

describe('Attendance Institution and Student Sync', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    httpProvider._clearTokenCache();
    process.env.ATTENDANCE_SERVICE_BASE_URL = 'http://localhost:4000';
    process.env.ATTENDANCE_ADMIN_SECRET = 'TEST_ADMIN_SECRET';
    process.env.ATTENDANCE_APPLICATION_NAME = 'reg-portal-api';
    process.env.ATTENDANCE_PROVIDER = 'http';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Provider Registry', () => {
    it('should resolve http as the default provider', () => {
      expect(attendanceProviders.DEFAULT_PROVIDER).toBe('http');
      expect(attendanceProviders.list()).toEqual(['http']);
      expect(attendanceProviders.get()).toBe(httpProvider);
    });
  });

  describe('HTTP Provider - syncInstitutions', () => {
    it('should obtain access token and send POST /api/auth/sync-institutions with expected payload', async () => {
      const mockAuthPost = jest.fn().mockResolvedValue({
        data: { token: 'mock-access-token' },
      });
      const mockDataRequest = jest.fn().mockResolvedValue({
        data: { data: { success: true, count: 1 } },
      });

      axios.create.mockImplementation((config) => {
        if (config.headers && config.headers['x-admin-secret']) {
          return { post: mockAuthPost };
        }
        return { request: mockDataRequest };
      });

      const payload = {
        institutions: [
          {
            institutionCode: '1001',
            institutionName: 'Morgan Green',
            address: '8 Ekundayo Street, Lagos, Nigeria',
            coordinates: { latitude: 6.4518847, longitude: 3.33262 },
            lectureRadius: 100,
          },
        ],
      };

      const res = await httpProvider.syncInstitutions(payload);

      expect(mockAuthPost).toHaveBeenCalledWith(
        '/api/auth/generate-token',
        { applicationName: 'reg-portal-api' }
      );

      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:4000',
          headers: expect.objectContaining({
            'x-app-name': 'reg-portal-api',
            'x-app-token': 'mock-access-token',
          }),
        })
      );

      expect(mockDataRequest).toHaveBeenCalledWith({
        method: 'POST',
        url: '/api/auth/sync-institutions',
        params: {},
        data: payload,
      });

      expect(res).toEqual({ success: true, count: 1 });
    });

    it('should wrap array payload into { institutions: [...] }', async () => {
      const mockAuthPost = jest.fn().mockResolvedValue({
        data: { token: 'mock-access-token' },
      });
      const mockDataRequest = jest.fn().mockResolvedValue({
        data: { success: true },
      });

      axios.create.mockImplementation((config) => {
        if (config.headers && config.headers['x-admin-secret']) {
          return { post: mockAuthPost };
        }
        return { request: mockDataRequest };
      });

      const institutionsArray = [
        {
          institutionCode: '1002',
          institutionName: 'Test Academy',
          address: 'Abuja, Nigeria',
          coordinates: { latitude: 9.0765, longitude: 7.3986 },
          lectureRadius: 150,
        },
      ];

      await httpProvider.syncInstitutions(institutionsArray);

      expect(mockDataRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'POST',
          url: '/api/auth/sync-institutions',
          data: { institutions: institutionsArray },
        })
      );
    });
  });

  describe('AttendanceService Delegations', () => {
    it('should delegate syncInstitutions and syncStudents to active provider', async () => {
      const syncInstSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true, count: 1 });
      const syncStudentsSpy = jest.spyOn(httpProvider, 'syncStudents').mockResolvedValue({ success: true, count: 2 });

      const instRes = await AttendanceService.syncInstitutions({ institutions: [] });
      expect(instRes).toEqual({ success: true, count: 1 });
      expect(syncInstSpy).toHaveBeenCalledWith({ institutions: [] });

      const studentsRes = await AttendanceService.syncStudents({ students: [] });
      expect(studentsRes).toEqual({ success: true, count: 2 });
      expect(syncStudentsSpy).toHaveBeenCalledWith({ students: [] });

      syncInstSpy.mockRestore();
      syncStudentsSpy.mockRestore();
    });
  });

  describe('Catalog Service - _syncInstitutionToAttendance', () => {
    it('should format institution payload with institutionCode, institutionName, address, coordinates, and lectureRadius', async () => {
      const syncSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true });

      const university = {
        id: '11111111-1111-1111-1111-111111111111',
        code: '1001',
        name: 'Morgan Green',
        jupeb_prefix: '1001',
        address: '8 Ekundayo Street, Lagos, Nigeria',
      };

      await catalogService._syncInstitutionToAttendance(university, {
        code: '1001',
        name: 'Morgan Green',
        address: '8 Ekundayo Street, Lagos, Nigeria',
        coordinates: { latitude: 6.4518847, longitude: 3.33262 },
        lectureRadius: 100,
      });

      expect(syncSpy).toHaveBeenCalledTimes(1);
      expect(syncSpy).toHaveBeenCalledWith({
        institutions: [
          {
            institutionCode: '1001',
            institutionName: 'Morgan Green',
            address: '8 Ekundayo Street, Lagos, Nigeria',
            coordinates: { latitude: 6.4518847, longitude: 3.33262 },
            lectureRadius: 100,
          },
        ],
      });

      syncSpy.mockRestore();
    });

    it('should use fallback coordinates and default lectureRadius (100) when omitted', async () => {
      const syncSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true });

      const university = {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'UNILAG',
        name: 'University of Lagos',
        jupeb_prefix: '001',
        address: 'Akoka, Lagos',
      };

      await catalogService._syncInstitutionToAttendance(university, {
        code: 'UNILAG',
        name: 'University of Lagos',
      });

      expect(syncSpy).toHaveBeenCalledWith({
        institutions: [
          {
            institutionCode: '001',
            institutionName: 'University of Lagos',
            address: 'Akoka, Lagos',
            coordinates: { latitude: 6.4518847, longitude: 3.33262 },
            lectureRadius: 100,
          },
        ],
      });

      syncSpy.mockRestore();
    });

    it('should catch errors and not re-throw if provider call fails', async () => {
      const syncSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockRejectedValue(new Error('Network error'));
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const university = {
        id: '33333333-3333-3333-3333-333333333333',
        code: 'TEST',
        name: 'Test Uni',
        jupeb_prefix: '999',
      };

      await expect(
        catalogService._syncInstitutionToAttendance(university, {})
      ).resolves.not.toThrow();

      expect(consoleErrorSpy).toHaveBeenCalled();

      syncSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});
