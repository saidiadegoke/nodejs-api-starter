const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('JUPEB submission API', () => {
  let submissionMigrated = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM jupeb_document_requirements LIMIT 1');
      submissionMigrated = true;
    } catch {
      submissionMigrated = false;
      // eslint-disable-next-line no-console
      console.warn('[jupeb.submission.api] Skipping: apply migration `005_jupeb_submission.sql`.');
    }
  });

  it('GET /submission/requirements without auth returns 401', async () => {
    const res = await request(app).get('/submission/requirements');
    expect(res.status).toBe(401);
  });

  it('GET /submission/me/requirements without auth returns 401', async () => {
    const res = await request(app).get('/submission/me/requirements');
    expect(res.status).toBe(401);
  });
});
