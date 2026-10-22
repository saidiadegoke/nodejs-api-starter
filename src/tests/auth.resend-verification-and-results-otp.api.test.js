const request = require('supertest');
const { getAppUnderTest } = require('./helpers/app-under-test');
const pool = require('../database/pool');
const { OtpService } = require('../modules/auth/services/otp.service');
const { ResultsReleaseService } = require('../modules/academic/services/results-release.service');
const { nextJupebTestPrefix, nextJupebAcademicSession } = require('./jupeb-session-test-helpers');

describe('Resend Verification Email and OTP-Gated Results Release', () => {
  let app;
  let adminToken;
  let testUserId;
  let testUserEmail;
  let verifiedUserId;
  let verifiedUserEmail;

  beforeAll(async () => {
    app = await getAppUnderTest();

    // 1. Authenticate admin
    const loginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    adminToken = loginRes.body.data?.access_token || null;

    // 2. Create test unverified user
    testUserEmail = `unverified-${Date.now()}@test.edu.ng`;
    const userRes = await pool.query(
      `INSERT INTO users (email, phone, password_hash, email_verified, phone_verified, status)
       VALUES ($1, $2, 'hash123', false, false, 'active')
       RETURNING id`,
      [testUserEmail, `+23480${Math.floor(10000000 + Math.random() * 90000000)}`]
    );
    testUserId = userRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'Unverified', 'Candidate', 'Unverified Candidate')`,
      [testUserId]
    );

    // 3. Create test verified user
    verifiedUserEmail = `verified-${Date.now()}@test.edu.ng`;
    const verifiedRes = await pool.query(
      `INSERT INTO users (email, phone, password_hash, email_verified, phone_verified, status)
       VALUES ($1, $2, 'hash123', true, true, 'active')
       RETURNING id`,
      [verifiedUserEmail, `+23481${Math.floor(10000000 + Math.random() * 90000000)}`]
    );
    verifiedUserId = verifiedRes.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name, display_name)
       VALUES ($1, 'Verified', 'Staff', 'Verified Staff')`,
      [verifiedUserId]
    );
  });

  afterAll(async () => {
    if (testUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }
    if (verifiedUserId) {
      await pool.query('DELETE FROM users WHERE id = $1', [verifiedUserId]);
    }
  });

  describe('POST /auth/resend-verification', () => {
    it('returns 400 when unauthenticated and no email provided', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/email is required/i);
    });

    it('returns sent: true without error when email does not exist (non-leaking)', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email: 'nonexistent-student-email-404@nowhere.com' });

      expect(res.status).toBe(200);
      const sent = res.body.data?.sent ?? res.body.sent;
      expect(sent).toBe(true);
    });

    it('resends verification email successfully for unverified candidate by email', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email: testUserEmail });

      expect(res.status).toBe(200);
      const sent = res.body.data?.sent ?? res.body.sent;
      expect(sent).toBe(true);
    });

    it('handles already-verified candidate gracefully', async () => {
      const res = await request(app)
        .post('/auth/resend-verification')
        .send({ email: verifiedUserEmail });

      expect(res.status).toBe(200);
      const body = res.body.data || res.body;
      expect(body.sent).toBe(true);
      expect(body.already_verified).toBe(true);
    });

    it('supports resend verification with Bearer token authentication', async () => {
      if (!adminToken) return;

      const res = await request(app)
        .post('/auth/resend-verification')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});

      expect(res.status).toBe(200);
      const sent = res.body.data?.sent ?? res.body.sent;
      expect(sent).toBe(true);
    });
  });

  describe('OtpService purpose and non-flipping behavior', () => {
    it('issues results_release OTP and does not flip user email/phone verified on verify', async () => {
      const otpCodeRepo = {
        purgeAndCreate: jest.fn().mockImplementation(async (data) => ({
          id: 'otp-uuid-1',
          ...data,
          attemptCount: 0,
        })),
        findLatestActiveOtp: jest.fn().mockImplementation(async () => ({
          id: 'otp-uuid-1',
          userId: testUserId,
          codeHash: OtpService._hashCode('654321'),
          channel: 'email',
          expiresAt: new Date(Date.now() + 600000),
          attemptCount: 0,
        })),
        incrementAttemptCount: jest.fn().mockResolvedValue(undefined),
        markVerified: jest.fn().mockResolvedValue(undefined),
      };

      const mockQuery = jest.fn().mockImplementation(async (sql, params) => {
        if (sql.includes('SELECT u.id, u.email')) {
          return [
            {
              id: testUserId,
              email: testUserEmail,
              phone: '+2348000000000',
              email_verified: false,
              phone_verified: false,
              first_name: 'Test',
              last_name: 'User',
            },
          ];
        }
        return [];
      });

      const dataSource = { query: mockQuery };
      const mailService = { sendOtpEmail: jest.fn().mockResolvedValue('msg-id-1') };

      const service = new OtpService(otpCodeRepo, dataSource, mailService);

      // Issue OTP with purpose = results_release
      const issued = await service.issueOtp(testUserId, {
        channel: 'email',
        purpose: 'results_release',
      });
      expect(issued.otp_id).toBe('otp-uuid-1');

      // Wait a tick for the setImmediate email dispatch
      await new Promise((resolve) => setImmediate(resolve));
      expect(mailService.sendOtpEmail).toHaveBeenCalled();

      // Verify OTP with purpose = results_release
      const verified = await service.verifyOtp(testUserId, '654321', {
        purpose: 'results_release',
      });
      expect(verified.verified).toBe(true);
      expect(otpCodeRepo.markVerified).toHaveBeenCalledWith('otp-uuid-1');

      // Crucial requirement: No UPDATE users query to flip email_verified = true
      const updateCalls = mockQuery.mock.calls.filter(([sql]) =>
        sql.includes('UPDATE users SET')
      );
      expect(updateCalls.length).toBe(0);
    });
  });

  describe('ResultsReleaseService OTP Gating', () => {
    let mockSessionRepo;
    let mockInstSessionRepo;
    let mockScopeService;
    let mockOtpService;
    let mockDataSource;
    let resultsReleaseService;

    const testSession = {
      id: 'session-uuid-1',
      academicYear: '2025/2026',
      resultsReleasedToInstitutions: false,
      resultsReleasedAt: null,
      resultsReleasedBy: null,
    };

    beforeEach(() => {
      mockSessionRepo = {
        findById: jest.fn().mockResolvedValue({ ...testSession }),
        findByAcademicYear: jest.fn().mockResolvedValue({ ...testSession }),
        findActive: jest.fn().mockResolvedValue({ ...testSession }),
        update: jest.fn().mockResolvedValue(undefined),
      };

      mockInstSessionRepo = {
        findBySessionAndUniversity: jest.fn().mockResolvedValue(null),
        upsertInstitutionRelease: jest.fn().mockResolvedValue({
          session_id: 'session-uuid-1',
          university_id: 'uni-uuid-1',
          resultsReleasedToStudents: true,
          studentsResultsReleasedAt: new Date(),
        }),
      };

      mockScopeService = {
        effectiveUniversityId: jest.fn().mockResolvedValue('uni-uuid-1'),
        assertUniversityAccess: jest.fn().mockResolvedValue(undefined),
      };

      mockOtpService = {
        issueOtp: jest.fn().mockResolvedValue({
          otp_id: 'otp-123',
          channels: ['email'],
          expires_at: new Date(Date.now() + 600000),
          code: '123456',
        }),
        verifyOtp: jest.fn().mockImplementation(async (userId, code) => {
          if (code !== '123456') {
            const err = new Error('Invalid verification code');
            err.status = 400;
            throw err;
          }
          return { verified: true, channel: 'email' };
        }),
      };

      mockDataSource = {
        query: jest.fn().mockResolvedValue([{ id: 'reg-1' }]),
      };

      const mockLoggerFactory = {
        create: () => ({
          log: jest.fn(),
          error: jest.fn(),
          warn: jest.fn(),
          debug: jest.fn(),
        }),
      };

      resultsReleaseService = new ResultsReleaseService(
        mockSessionRepo,
        mockInstSessionRepo,
        {},
        mockScopeService,
        mockOtpService,
        mockDataSource,
        mockLoggerFactory
      );
    });

    it('requestReleaseOtp dispatches authorization code', async () => {
      const res = await resultsReleaseService.requestReleaseOtp('user-1', {
        session_id: 'session-uuid-1',
        channel: 'email',
      });

      expect(res.success).toBe(true);
      expect(res.otp_id).toBe('otp-123');
      expect(mockOtpService.issueOtp).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          channel: 'email',
          purpose: 'results_release',
        })
      );
    });

    it('releaseToInstitutions rejects when REQUIRE_RELEASE_OTP=true and OTP is missing', async () => {
      const prevEnv = process.env.REQUIRE_RELEASE_OTP;
      process.env.REQUIRE_RELEASE_OTP = 'true';

      await expect(
        resultsReleaseService.releaseToInstitutions('user-1', {
          session_id: 'session-uuid-1',
          release: true,
        })
      ).rejects.toThrow(/OTP authorization code is required/i);

      process.env.REQUIRE_RELEASE_OTP = prevEnv;
    });

    it('releaseToInstitutions succeeds when valid OTP is provided', async () => {
      const res = await resultsReleaseService.releaseToInstitutions('user-1', {
        session_id: 'session-uuid-1',
        release: true,
        otp: '123456',
      });

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith(
        'user-1',
        '123456',
        expect.objectContaining({
          purpose: 'results_release',
          skipUserVerificationFlip: true,
        })
      );
      expect(mockSessionRepo.update).toHaveBeenCalled();
      expect(res.session_id).toBe('session-uuid-1');
    });

    it('releaseToStudents rejects when REQUIRE_RELEASE_OTP=true and OTP is missing', async () => {
      const prevEnv = process.env.REQUIRE_RELEASE_OTP;
      process.env.REQUIRE_RELEASE_OTP = 'true';

      // Set session as already released to institutions
      mockSessionRepo.findById.mockResolvedValueOnce({
        ...testSession,
        resultsReleasedToInstitutions: true,
      });

      await expect(
        resultsReleaseService.releaseToStudents('user-1', {
          session_id: 'session-uuid-1',
          university_id: 'uni-uuid-1',
          release_all: true,
        })
      ).rejects.toThrow(/OTP authorization code is required/i);

      process.env.REQUIRE_RELEASE_OTP = prevEnv;
    });

    it('releaseToStudents rejects when invalid OTP is provided', async () => {
      mockSessionRepo.findById.mockResolvedValueOnce({
        ...testSession,
        resultsReleasedToInstitutions: true,
      });

      await expect(
        resultsReleaseService.releaseToStudents('user-1', {
          session_id: 'session-uuid-1',
          university_id: 'uni-uuid-1',
          release_all: true,
          otp: '000000',
        })
      ).rejects.toThrow(/Invalid verification code/i);
    });

    it('releaseToStudents succeeds with valid OTP and updates candidate records', async () => {
      mockSessionRepo.findById.mockResolvedValueOnce({
        ...testSession,
        resultsReleasedToInstitutions: true,
      });

      const res = await resultsReleaseService.releaseToStudents('user-1', {
        session_id: 'session-uuid-1',
        university_id: 'uni-uuid-1',
        release_all: true,
        otp: '123456',
      });

      expect(mockOtpService.verifyOtp).toHaveBeenCalledWith(
        'user-1',
        '123456',
        expect.objectContaining({
          purpose: 'results_release',
          skipUserVerificationFlip: true,
        })
      );
      expect(res.results_released_to_students).toBe(true);
      expect(res.released_count).toBe(1);
    });
  });
});
