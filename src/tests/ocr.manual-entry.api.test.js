const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('OCR Manual Entry API (POST /ocr/manual-entry)', () => {
  let userToken;
  let testUserId;
  let createdJobId;

  beforeAll(async () => {
    // Obtain a token for a registered user/admin
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });

    userToken = res.body.data?.access_token;
    testUserId = res.body.data?.user?.id;
  });

  afterAll(async () => {
    if (createdJobId) {
      await pool.query('DELETE FROM ocr_jobs WHERE id = $1', [createdJobId]).catch(() => {});
    }
  });

  it('should reject requests missing exam_type', async () => {
    const res = await request(app)
      .post('/ocr/manual-entry')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        subjects: [{ name: 'Biology', grade: 'A1' }],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/exam_type is required/i);
  });

  it('should reject requests with empty subjects array', async () => {
    const res = await request(app)
      .post('/ocr/manual-entry')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        exam_type: 'waec',
        subjects: [],
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/subjects must be a non-empty array/i);
  });

  it('should successfully create manual result entry with null file_id', async () => {
    const payload = {
      exam_type: 'waec',
      subjects: [
        { name: 'Biology', grade: 'A1' },
        { name: 'Chemistry', grade: 'B2' },
        { name: 'Animal Husbandry', grade: 'A1' },
      ],
      metadata: {
        registration_id: '506fed2b-b2e9-4e42-94c6-b06f513593bf',
        requirement_id: 'f9d8fae1-7e2e-4a6b-bd0c-64098f02d33d',
        sitting: 1,
      },
    };

    const res = await request(app)
      .post('/ocr/manual-entry')
      .set('Authorization', `Bearer ${userToken}`)
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();

    const job = res.body.data;
    createdJobId = job.job_id;

    expect(job.file_id).toBeNull();
    expect(job.provider).toBe('manual');
    expect(job.status).toBe('completed');
    expect(job.exam_type).toBe('waec');
    expect(job.result).toBeDefined();
    expect(job.result.source).toBe('manual');
    expect(job.result.subjects).toHaveLength(3);
    expect(job.result.subjects[0]).toEqual({ name: 'Biology', grade: 'A1' });
    expect(job.metadata.registration_id).toBe('506fed2b-b2e9-4e42-94c6-b06f513593bf');

    // Verify written through to jupeb_result_entries
    const resultEntries = await pool.query(
      `SELECT * FROM jupeb_result_entries WHERE ocr_job_id = $1 ORDER BY serial ASC`,
      [createdJobId]
    );
    expect(resultEntries.rows).toHaveLength(3);
    expect(resultEntries.rows[0].subject).toBe('BIOLOGY');
    expect(resultEntries.rows[0].grade).toBe('A1');
    expect(resultEntries.rows[0].grade_normalized).toBe('A');
    expect(resultEntries.rows[0].origin).toBe('manual');
  });

  it('should allow re-capturing biometrics without 409 conflict', async () => {
    // Find an active registration to test biometrics capture
    const regRes = await pool.query(`SELECT id FROM jupeb_registrations LIMIT 1`);
    if (!regRes.rows.length) return;
    const regId = regRes.rows[0].id;

    // First biometric capture
    const firstRes = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        external_reference: 'https://example.com/face1.jpg',
        quality_score: 0.85,
      });

    expect(firstRes.status).toBe(201);
    const firstCaptureId = firstRes.body.data.id;

    // Second biometric capture of same type should succeed (replaces first without 409)
    const secondRes = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        external_reference: 'https://example.com/face2.jpg',
        quality_score: 0.95,
      });

    expect(secondRes.status).toBe(201);
    const secondCaptureId = secondRes.body.data.id;
    expect(secondCaptureId).not.toBe(firstCaptureId);

    // Verify first capture was marked replaced
    const oldCapture = await pool.query(
      `SELECT replaced_at FROM jupeb_biometric_captures WHERE id = $1`,
      [firstCaptureId]
    );
    expect(oldCapture.rows[0].replaced_at).not.toBeNull();

    // Clean up test captures
    await pool.query(
      `DELETE FROM jupeb_biometric_captures WHERE id IN ($1, $2)`,
      [firstCaptureId, secondCaptureId]
    ).catch(() => {});
  });
});

