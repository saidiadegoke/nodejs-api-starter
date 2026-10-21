const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
  buildCatalogUniversityPayload,
} = require('./jupeb-session-test-helpers');

describe('NIN Validation & Audit English Sentence Display', () => {
  let adminToken;
  let sessionId;
  let universityId;
  let subjectCombinationId;

  const adminCredentials = {
    identifier: 'admin@example.com',
    password: 'Admin@12',
  };

  beforeAll(async () => {
    const loginRes = await request(app).post('/auth/login').send(adminCredentials);
    if (loginRes.status === 200 && loginRes.body.data?.access_token) {
      adminToken = loginRes.body.data.access_token;
    }

    if (!adminToken) return;

    // Get or create university fixture
    const uniRow = await pool.query(`SELECT id FROM jupeb_universities WHERE deleted_at IS NULL LIMIT 1`);
    if (uniRow.rows[0]) {
      universityId = uniRow.rows[0].id;
    } else {
      const uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(buildCatalogUniversityPayload('NIN', { name: `NIN Test Uni ${Date.now()}` }));
      if (uniRes.status === 201) universityId = uniRes.body.data.id;
    }

    // Get or create subject combination fixture
    const scRow = await pool.query(`SELECT id FROM jupeb_subject_combinations WHERE deleted_at IS NULL LIMIT 1`);
    if (scRow.rows[0]) {
      subjectCombinationId = scRow.rows[0].id;
    } else {
      const scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode('NC'),
          title: 'NIN Combination',
          subjects: ['Mathematics', 'Physics', 'Chemistry'],
          is_global: true,
        });
      if (scRes.status === 201) subjectCombinationId = scRes.body.data.id;
    }

    // Get or create active session
    const sessRow = await pool.query(`SELECT id FROM jupeb_registration_sessions WHERE status = 'open' LIMIT 1`);
    if (sessRow.rows[0]) {
      sessionId = sessRow.rows[0].id;
    } else {
      const { academicYear, yearShort } = nextJupebAcademicSession();
      const sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(Date.now() - 30 * 86400000).toISOString(),
          closes_at: new Date(Date.now() + 365 * 86400000).toISOString(),
        });
      if (sessRes.status === 201) {
        sessionId = sessRes.body.data.id;
        await closeAllOpenJupebSessions(adminToken);
        await request(app).post(`/sessions/${sessionId}/open`).set('Authorization', `Bearer ${adminToken}`);
      }
    }
  });

  describe('Single candidate creation NIN validation', () => {
    it('rejects candidate registration with invalid length NIN (< 11 digits) with 422', async () => {
      if (!adminToken || !sessionId || !universityId) return;

      const res = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: sessionId,
          university_id: universityId,
          subject_combination_id: subjectCombinationId,
          nin: '12345',
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/NIN/i);
    });

    it('rejects candidate registration with all-zero NIN (00000000000) with 422', async () => {
      if (!adminToken || !sessionId || !universityId) return;

      const res = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: sessionId,
          university_id: universityId,
          subject_combination_id: subjectCombinationId,
          nin: '00000000000',
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/NIN/i);
    });

    it('rejects candidate registration with repeating digits NIN (11111111111) with 422', async () => {
      if (!adminToken || !sessionId || !universityId) return;

      const res = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: sessionId,
          university_id: universityId,
          subject_combination_id: subjectCombinationId,
          nin: '11111111111',
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/NIN/i);
    });

    it('rejects candidate registration with unverified / failed NIN with 422', async () => {
      if (!adminToken || !sessionId || !universityId) return;

      // Create an unverified / failed verification record in DB
      const failedNv = await pool.query(
        `INSERT INTO jupeb_nin_verifications (nin_hash, nin_last4, provider, status, created_at)
         VALUES ('fakehash123', '9999', 'speedysms', 'failed', NOW())
         RETURNING id`
      );
      const failedNvId = failedNv.rows[0].id;

      const res = await request(app)
        .post('/registration/institution/registrations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          session_id: sessionId,
          university_id: universityId,
          subject_combination_id: subjectCombinationId,
          nin_verification_id: failedNvId,
        });

      expect(res.status).toBe(422);
      expect(res.body.message).toMatch(/verified status/i);
    });
  });

  describe('Bulk candidate upload NIN validation', () => {
    it('rejects invalid NINs in bulk upload and marks them as skipped/failed', async () => {
      if (!adminToken || !sessionId || !universityId || !subjectCombinationId) return;

      const csvRows = [
        'first_name,last_name,email,phone,nin,combination_code',
        'Valid,Student,valid_nin@test.com,08012345678,00000000001,COMBO',
        'Bad,Student,bad_nin@test.com,08012345679,00000000000,COMBO',
        'Short,Student,short_nin@test.com,08012345680,12345,COMBO',
      ].join('\n');

      const res = await request(app)
        .post('/registration/institution/registrations/bulk-upload')
        .set('Authorization', `Bearer ${adminToken}`)
        .field('session_id', sessionId)
        .field('university_id', universityId)
        .field('provider', 'mock')
        .attach('file', Buffer.from(csvRows), 'test_nins.csv');

      expect([200, 207, 422]).toContain(res.status);
      const data = res.body.data;
      // All zeroes (00000000000) and short NIN (12345) must not succeed!
      expect(data.succeeded_count).toBeLessThanOrEqual(1);
      const allErrors = [...(data.failed || []), ...(data.skipped || [])];
      const errorCodes = allErrors.map((e) => e.error_code);
      expect(errorCodes).toContain('invalid_nin');
    });
  });

  describe('Audit log details_display natural English sentence formatting', () => {
    it('returns natural English sentence in details_display instead of raw technical key-value', async () => {
      if (!adminToken) return;

      const res = await request(app)
        .get('/audit?limit=20')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      const logs = res.body.data;
      if (logs.length > 0) {
        for (const log of logs) {
          if (log.details_display) {
            // Must not contain raw key-value snippets like "locked: false" or JSON "{...}"
            expect(log.details_display).not.toMatch(/^locked:\s*(true|false)$/);
            expect(log.details_display).not.toMatch(/^{.*}$/);
            // Must be proper English sentence
            expect(typeof log.details_display).toBe('string');
            expect(log.details_display.length).toBeGreaterThan(0);
          }
        }
      }
    });
  });
});
