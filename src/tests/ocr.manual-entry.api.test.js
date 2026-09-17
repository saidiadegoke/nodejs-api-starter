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
  });
});
