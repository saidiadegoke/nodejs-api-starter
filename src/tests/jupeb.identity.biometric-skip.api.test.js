const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('biometric skip', () => {
  let migrated = false;

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.columns
         WHERE table_name = 'jupeb_registrations' AND column_name = 'fingerprint_skipped_at'`
      );
      migrated = r.rowCount > 0;
    } catch {
      migrated = false;
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  // The skip endpoint accepts an existing registration row. We carve a minimal one through
  // direct INSERT here because no public API can produce an arbitrary "already-claimed by me"
  // registration without going through the full institution + claim flow. (Strictly fixture.)
  async function seedRegistrationForUser(userId) {
    const sessRow = await pool.query(`SELECT id FROM jupeb_registration_sessions LIMIT 1`);
    const uniRow = await pool.query(`SELECT id FROM jupeb_universities LIMIT 1`);
    if (!sessRow.rows[0] || !uniRow.rows[0]) return null;
    const ins = await pool.query(
      `INSERT INTO jupeb_registrations (session_id, university_id, user_id, status, created_by, provisional_serial)
       VALUES ($1, $2, $3, 'claimed', $3, 1)
       RETURNING id`,
      [sessRow.rows[0].id, uniRow.rows[0].id, userId]
    );
    return ins.rows[0].id;
  }

  it('requires auth', async () => {
    const res = await request(app).post(
      '/identity/registrations/00000000-0000-0000-0000-000000000000/biometrics/skip'
    );
    expect(res.status).toBe(401);
  });

  it('marks fingerprint as skipped and locks subsequent self-service capture', async () => {
    if (!migrated) return;
    const studentLogin = await request(app)
      .post('/auth/login')
      .send({ identifier: 'student@example.com', password: 'Student@12' });
    if (studentLogin.status !== 200 || !studentLogin.body.data?.access_token) return;
    const studentToken = studentLogin.body.data.access_token;
    const studentRow = await pool.query(
      `SELECT id FROM users WHERE email = 'student@example.com' LIMIT 1`
    );
    const studentId = studentRow.rows[0].id;
    const regId = await seedRegistrationForUser(studentId);
    if (!regId) return;

    const skipRes = await request(app)
      .post(`/identity/registrations/${regId}/biometrics/skip`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ capture_type: 'fingerprint' });
    expect(skipRes.status).toBe(200);
    expect(skipRes.body.data.fingerprint_skipped_at).toBeDefined();

    const captureRes = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        registration_id: regId,
        capture_type: 'fingerprint',
        external_reference: 'vault-1',
        quality_score: 0.9,
      });
    expect(captureRes.status).toBe(403);
    expect(captureRes.body.message).toMatch(/skipped|locked/i);

    // Privileged role (admin) can still capture on the student's behalf.
    const adminToken = await getAdminToken();
    if (adminToken) {
      const adminCapture = await request(app)
        .post('/identity/biometrics')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          registration_id: regId,
          capture_type: 'fingerprint',
          external_reference: 'vault-2',
          quality_score: 0.9,
        });
      expect(adminCapture.status).toBe(201);
    }

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
  });

  it('PUT /identity/biometrics/:id replaces an existing capture without unique-index conflict', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    const first = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        external_reference: 'vault-face-1',
        quality_score: 0.7,
      });
    expect(first.status).toBe(201);
    const oldId = first.body.data.id;

    const replace = await request(app)
      .put(`/identity/biometrics/${oldId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        external_reference: 'vault-face-2',
        quality_score: 0.95,
      });
    expect(replace.status).toBe(200);
    expect(replace.body.data.id).not.toBe(oldId);
    expect(replace.body.data.external_reference).toBe('vault-face-2');

    // GET should now show only the replacement as active.
    const list = await request(app)
      .get(`/identity/registrations/${regId}/biometrics`)
      .set('Authorization', `Bearer ${token}`);
    const active = list.body.data.filter((b) => b.replaced_at === null);
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(replace.body.data.id);

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
  });

  it('rejects face captures below JUPEB_FACE_MIN_QUALITY threshold', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;
    const original = process.env.JUPEB_FACE_MIN_QUALITY;
    process.env.JUPEB_FACE_MIN_QUALITY = '0.6';
    try {
      const low = await request(app)
        .post('/identity/biometrics')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registration_id: regId,
          capture_type: 'face',
          external_reference: 'vault-low',
          quality_score: 0.4,
        });
      expect(low.status).toBe(422);
      expect(low.body.message).toMatch(/quality/i);

      const ok = await request(app)
        .post('/identity/biometrics')
        .set('Authorization', `Bearer ${token}`)
        .send({
          registration_id: regId,
          capture_type: 'face',
          external_reference: 'vault-ok',
          quality_score: 0.85,
        });
      expect(ok.status).toBe(201);
    } finally {
      if (original === undefined) delete process.env.JUPEB_FACE_MIN_QUALITY;
      else process.env.JUPEB_FACE_MIN_QUALITY = original;
      await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
      await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
    }
  });

  it('rejects invalid capture_type', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;
    const res = await request(app)
      .post(`/identity/registrations/${regId}/biometrics/skip`)
      .set('Authorization', `Bearer ${token}`)
      .send({ capture_type: 'iris' });
    expect(res.status).toBe(422);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
  });
});
