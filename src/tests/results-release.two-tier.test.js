const request = require('supertest');
const axios = require('axios');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

jest.mock('axios');

describe('Two-Tier Result Release Workflow (Registrar -> Institutions -> Students)', () => {
  let adminToken = null;
  let sessionId = null;
  let academicYear = null;
  let universityId = null;
  let registrationData = null;

  function createMockClient() {
    return {
      request: jest.fn().mockResolvedValue({
        status: 200,
        data: {
          success: true,
          message: 'Results retrieved successfully',
          data: {
            summary: {
              grade_label: 'A',
              average_score: 85,
              grade_point: 7,
            },
            exam_scores: [
              {
                id: '11111111-1111-1111-1111-111111111111',
                subject: 'Mathematics',
                ca: '15/15',
                exam: '70/85',
                total: '85/100',
                grade: 'A',
              },
            ],
            download_url: 'https://cdn.example.com/results/transcript.pdf',
            share_url: 'https://portal.example.com/results/share/token',
          },
        },
      }),
      get: jest.fn().mockResolvedValue({ status: 200, data: {} }),
      post: jest.fn().mockResolvedValue({ status: 200, data: { token: 'mock_token' } }),
    };
  }

  beforeEach(() => {
    process.env.CRMS_PROVIDER = 'http';
    process.env.CRMS_SERVICE_BASE_URL = 'https://crms.test';
    process.env.CRMS_SERVICE_API_KEY = 'test_key';
    axios.create.mockImplementation(() => createMockClient());
  });

  beforeAll(async () => {
    process.env.CRMS_PROVIDER = 'http';
    process.env.CRMS_SERVICE_BASE_URL = 'https://crms.test';
    process.env.CRMS_SERVICE_API_KEY = 'test_key';
    axios.create.mockImplementation(() => createMockClient());

    const loginRes = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    adminToken = loginRes.body.data?.access_token || null;

    if (!adminToken) return;

    // Set up university, combo, session and registration
    const tag = 'RR';
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestPrefix(),
          name: `${tag} Release Uni ${Date.now()}`,
          short_name: `${tag}RU`,
          jupeb_prefix: nextJupebTestPrefix(),
          email: `${tag.toLowerCase()}-${Date.now()}-${i}@release-test.edu.ng`,
        });
      if (uniRes.status === 201) break;
    }
    universityId = uniRes.body.data.id;

    let scRes;
    for (let i = 0; i < 5; i += 1) {
      scRes = await request(app)
        .post('/catalog/subject-combinations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(`${tag}SC`),
          title: `${tag} Combo`,
          subjects: ['Math', 'Phys', 'Chem'],
          is_global: true,
        });
      if (scRes.status === 201) break;
    }

    let sessRes;
    for (let i = 0; i < 5; i += 1) {
      const { y1, academicYear: ay, yearShort } = nextJupebAcademicSession();
      academicYear = ay;
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: ay,
          year_short: yearShort,
          opens_at: new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString(),
          closes_at: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    sessionId = sessRes.body.data.id;

    await closeAllOpenJupebSessions(adminToken);
    await request(app)
      .post(`/sessions/${sessionId}/open`)
      .set('Authorization', `Bearer ${adminToken}`);

    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessionId,
        university_id: universityId,
        subject_combination_id: scRes.body.data.id,
      });
    expect(createReg.status).toBe(201);
    registrationData = createReg.body.data;

    // Claim the registration code for the current authenticated user
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ institution_issued_code: registrationData.institution_issued_code });
  });

  afterAll(async () => {
    if (sessionId) {
      await pool.query('DELETE FROM jupeb_registration_sessions WHERE id = $1', [sessionId]);
    }
    if (universityId) {
      await pool.query('DELETE FROM jupeb_universities WHERE id = $1', [universityId]);
    }
  });

  it('Tier 1 Gate: Blocks student dashboard results when registrar has not released', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get('/dashboard/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.details?.error_code).toBe('RESULTS_NOT_YET_RELEASED');
  });

  it('Tier 1 Gate: Blocks institution results when registrar has not released', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get('/institution/results')
      .query({ academic_year: academicYear, university_id: universityId })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(403);
    expect(res.body.details?.error_code).toBe('RESULTS_NOT_YET_RELEASED');
  });

  it('Tier 1 Gate: Blocks premature institution release to students', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .post('/institution/results/release-to-students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        university_id: universityId,
        release_all: true,
      });

    expect(res.status).toBe(400);
    expect(res.body.details?.error_code).toBe('CENTRAL_RELEASE_REQUIRED');
  });

  it('Tier 1 Action: Registrar releases results to institutions successfully', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .post('/admin/results/release-to-institutions')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        release: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results_released_to_institutions).toBe(true);
    expect(res.body.data.academic_year).toBe(academicYear);
  });

  it('Tier 2 Gate: Institution can now view results, but students are still on hold', async () => {
    if (!adminToken) return;

    // Institution can view results now
    const instRes = await request(app)
      .get('/institution/results')
      .query({ academic_year: academicYear, university_id: universityId })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(instRes.status).toBe(200);
    expect(instRes.body.data.session.results_released_to_institutions).toBe(true);
    expect(instRes.body.data.institution_release.results_released_to_students).toBe(false);

    // Student is blocked under INSTITUTION_HOLD
    const studentRes = await request(app)
      .get('/dashboard/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(studentRes.status).toBe(403);
    expect(studentRes.body.details?.error_code).toBe('INSTITUTION_HOLD');
  });

  it('Tier 2 Action: Institution releases results to students', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .post('/institution/results/release-to-students')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        academic_year: academicYear,
        university_id: universityId,
        release_all: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.results_released_to_students).toBe(true);
    expect(res.body.data.released_count).toBeGreaterThan(0);
  });

  it('Student Access: Student can view results on /dashboard/results after both tiers release', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get('/dashboard/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.grade_label).toBe('A');
    expect(res.body.data.exam_scores.length).toBeGreaterThan(0);
  });

  it('Student Access: Student can also view results via /api/v1/students/me/results alias', async () => {
    if (!adminToken) return;

    const res = await request(app)
      .get('/api/v1/students/me/results')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.summary.grade_label).toBe('A');
  });
});
