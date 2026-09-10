const crmsProviders = require('../modules/integrations/crms');
const httpProvider = require('../modules/integrations/crms/http.provider');
const CrmsService = require('../modules/crms/services/crms.service');
const catalogService = require('../modules/jupeb/services/catalog.service');
const registrationService = require('../modules/jupeb/services/registration.service');
const registrationModel = require('../modules/jupeb/models/registration.model');
const axios = require('axios');

jest.mock('axios');

describe('CRMS Candidate and Institution Sync', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.CRMS_SERVICE_BASE_URL = 'http://localhost:3000';
    process.env.CRMS_SERVICE_API_KEY = 'TEST_API_KEY';
    process.env.CRMS_PROVIDER = 'http';
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('Provider Registry', () => {
    it('should resolve http as the default and only provider', () => {
      expect(crmsProviders.DEFAULT_PROVIDER).toBe('http');
      expect(crmsProviders.list()).toEqual(['http']);
      expect(crmsProviders.get()).toBe(httpProvider);
    });
  });

  describe('HTTP Provider', () => {
    it('should send POST /api/candidates/sync with x-api-key and payload', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { success: true, message: 'Candidates synced' },
      });
      axios.create.mockReturnValue({
        request: mockPost,
      });

      const candidates = [
        {
          candidateNumber: '24001001AB',
          firstName: 'John',
          lastName: 'Doe',
          institutionCode: '001',
          academicYear: '2024',
          subjects: ['CHE', 'PHY', 'MTH'],
        },
      ];

      const res = await httpProvider.syncCandidates(candidates);
      expect(axios.create).toHaveBeenCalledWith(
        expect.objectContaining({
          baseURL: 'http://localhost:3000',
          headers: expect.objectContaining({
            'x-api-key': 'TEST_API_KEY',
            Authorization: 'Bearer TEST_API_KEY',
          }),
        })
      );
      expect(mockPost).toHaveBeenCalledWith({
        method: 'POST',
        url: '/api/candidates/sync',
        data: candidates,
      });
      expect(res).toEqual({ success: true, message: 'Candidates synced' });
    });

    it('should send POST /api/institutions/sync with x-api-key and payload', async () => {
      const mockPost = jest.fn().mockResolvedValue({
        data: { data: { synced: 2 } },
      });
      axios.create.mockReturnValue({
        request: mockPost,
      });

      const institutions = [
        {
          code: '001',
          name: 'University of Lagos',
          shortCode: 'UNILAG',
          category: 'Federal',
          state: 'Lagos',
        },
        {
          code: '025',
          name: 'Federal University of Agriculture, Abeokuta',
          shortCode: 'FUNAAB',
          category: 'Federal',
          state: 'Ogun',
        },
      ];

      const res = await httpProvider.syncInstitutions(institutions);
      expect(mockPost).toHaveBeenCalledWith({
        method: 'POST',
        url: '/api/institutions/sync',
        data: institutions,
      });
      expect(res).toEqual({ synced: 2 });
    });
  });

  describe('CrmsService Delegations', () => {
    it('should delegate syncCandidates and syncInstitutions to active provider', async () => {
      const syncCandidatesSpy = jest.spyOn(httpProvider, 'syncCandidates').mockResolvedValue({ success: true, count: 1 });
      const syncInstitutionsSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true, count: 1 });

      const candidatesRes = await CrmsService.syncCandidates([{ candidateNumber: '24001' }]);
      expect(candidatesRes).toEqual({ success: true, count: 1 });
      expect(syncCandidatesSpy).toHaveBeenCalledWith([{ candidateNumber: '24001' }]);

      const instRes = await CrmsService.syncInstitutions([{ code: '001' }]);
      expect(instRes).toEqual({ success: true, count: 1 });
      expect(syncInstitutionsSpy).toHaveBeenCalledWith([{ code: '001' }]);

      syncCandidatesSpy.mockRestore();
      syncInstitutionsSpy.mockRestore();
    });
  });

  describe('Catalog Service - _syncInstitutionToCrms', () => {
    it('should format institution payload with code, name, shortCode, category, and state', async () => {
      const syncSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true });

      const university = {
        id: '11111111-1111-1111-1111-111111111111',
        code: 'UNILAG',
        name: 'University of Lagos',
        short_name: 'UNILAG',
        jupeb_prefix: '001',
        university_type: 'federal',
        address: 'Akoka, Yaba, Lagos',
      };

      await catalogService._syncInstitutionToCrms(university, {
        code: 'UNILAG',
        name: 'University of Lagos',
        short_name: 'UNILAG',
        jupeb_prefix: '001',
        university_type: 'federal',
        address: 'Akoka, Yaba, Lagos',
      });

      expect(syncSpy).toHaveBeenCalledWith([
        {
          code: '001',
          name: 'University of Lagos',
          shortCode: 'UNILAG',
          category: 'Federal',
          state: 'Lagos',
        },
      ]);

      syncSpy.mockRestore();
    });

    it('should prioritize explicit state and category from body', async () => {
      const syncSpy = jest.spyOn(httpProvider, 'syncInstitutions').mockResolvedValue({ success: true });

      const university = {
        id: '22222222-2222-2222-2222-222222222222',
        code: 'FUNAAB',
        name: 'Federal University of Agriculture, Abeokuta',
        short_name: 'FUNAAB',
        jupeb_prefix: '025',
        university_type: 'federal',
      };

      await catalogService._syncInstitutionToCrms(university, {
        state: 'Ogun',
        category: 'Federal',
      });

      expect(syncSpy).toHaveBeenCalledWith([
        {
          code: '025',
          name: 'Federal University of Agriculture, Abeokuta',
          shortCode: 'FUNAAB',
          category: 'Federal',
          state: 'Ogun',
        },
      ]);

      syncSpy.mockRestore();
    });
  });

  describe('Registration Service - _syncStudentsToCrms', () => {
    it('should chunk candidates and invoke syncCandidates', async () => {
      const mockPayloads = [
        {
          candidateNumber: '24001001AB',
          firstName: 'John',
          lastName: 'Doe',
          institutionCode: '001',
          academicYear: '2024',
          subjects: ['CHE', 'PHY', 'MTH'],
        },
      ];

      const getPayloadsSpy = jest
        .spyOn(registrationModel, 'getCrmsCandidateSyncPayloads')
        .mockResolvedValue(mockPayloads);
      const syncSpy = jest.spyOn(httpProvider, 'syncCandidates').mockResolvedValue({ success: true });

      await registrationService._syncStudentsToCrms(['reg-id-1'], {
        academic_year: '2024/2025',
        year_short: '24',
      });

      expect(getPayloadsSpy).toHaveBeenCalledWith(['reg-id-1'], {
        academic_year: '2024/2025',
        year_short: '24',
      });
      expect(syncSpy).toHaveBeenCalledWith(mockPayloads);

      getPayloadsSpy.mockRestore();
      syncSpy.mockRestore();
    });
  });
});
