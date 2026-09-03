const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');

describe('face selfie → profile_photo_url', () => {
  let migrated = false;

  beforeAll(async () => {
    try {
      const r = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_name = 'jupeb_biometric_captures'`
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

  async function seedFile(uploadedBy, url = 'http://example.com/durable-selfie.jpg') {
    const fileIns = await pool.query(
      `INSERT INTO files (file_url, file_type, file_size, uploaded_by, context, is_public)
       VALUES ($1, 'image/jpeg', 12345, $2, 'jupeb_biometric', true)
       RETURNING id, file_url`,
      [url, uploadedBy]
    );
    return fileIns.rows[0];
  }

  it('POST face with file_id writes durable URL to profiles.profile_photo_url', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    await pool.query(
      `INSERT INTO profiles (user_id, profile_photo_url) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET profile_photo_url = EXCLUDED.profile_photo_url`,
      [userId, 'https://nin.example/expiring-photo.jpg']
    );

    const file = await seedFile(userId, 'http://example.com/durable-selfie.jpg');
    const create = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        file_id: file.id,
        quality_score: 0.9,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.file_id).toBe(file.id);

    const profile = await pool.query(
      `SELECT profile_photo_url FROM profiles WHERE user_id = $1`,
      [userId]
    );
    expect(profile.rows[0].profile_photo_url).toBe('http://example.com/durable-selfie.jpg');

    const photo = await request(app)
      .get(`/identity/registrations/${regId}/photo`)
      .set('Authorization', `Bearer ${token}`);
    expect(photo.status).toBe(200);
    expect(photo.body.data.file_id).toBe(file.id);

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
    await pool.query(`DELETE FROM files WHERE id = $1`, [file.id]);
  });

  it('POST face with external_reference does not set profile_photo_url; GET photo 404', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    await pool.query(
      `INSERT INTO profiles (user_id, profile_photo_url) VALUES ($1, NULL)
       ON CONFLICT (user_id) DO UPDATE SET profile_photo_url = NULL`,
      [userId]
    );

    const create = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        external_reference: 'vault-face-only',
        quality_score: 0.9,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.file_id).toBeNull();

    const profile = await pool.query(
      `SELECT profile_photo_url FROM profiles WHERE user_id = $1`,
      [userId]
    );
    expect(profile.rows[0].profile_photo_url == null || profile.rows[0].profile_photo_url === '').toBe(
      true
    );

    const photo = await request(app)
      .get(`/identity/registrations/${regId}/photo`)
      .set('Authorization', `Bearer ${token}`);
    expect(photo.status).toBe(404);

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
  });

  it('POST face with external_reference set to uploaded file id resolves file_id and satisfies DB constraint', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    const file = await seedFile(userId, 'http://example.com/external-ref-selfie.jpg');
    const create = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        external_reference: file.id,
        quality_score: 0.9,
      });
    expect(create.status).toBe(201);
    expect(create.body.data.file_id).toBe(file.id);
    expect(create.body.data.external_reference).toBeNull();

    const profile = await pool.query(
      `SELECT profile_photo_url FROM profiles WHERE user_id = $1`,
      [userId]
    );
    expect(profile.rows[0].profile_photo_url).toBe('http://example.com/external-ref-selfie.jpg');

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
    await pool.query(`DELETE FROM files WHERE id = $1`, [file.id]);
  });

  it('PUT face replace with file_id overwrites profiles.profile_photo_url', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    const file1 = await seedFile(userId, 'http://example.com/selfie-v1.jpg');
    const file2 = await seedFile(userId, 'http://example.com/selfie-v2.jpg');

    const first = await request(app)
      .post('/identity/biometrics')
      .set('Authorization', `Bearer ${token}`)
      .send({
        registration_id: regId,
        capture_type: 'face',
        file_id: file1.id,
        quality_score: 0.8,
      });
    expect(first.status).toBe(201);

    const replace = await request(app)
      .put(`/identity/biometrics/${first.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        file_id: file2.id,
        quality_score: 0.95,
      });
    expect(replace.status).toBe(200);

    const profile = await pool.query(
      `SELECT profile_photo_url FROM profiles WHERE user_id = $1`,
      [userId]
    );
    expect(profile.rows[0].profile_photo_url).toBe('http://example.com/selfie-v2.jpg');

    await pool.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = $1`, [regId]);
    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
    await pool.query(`DELETE FROM files WHERE id IN ($1, $2)`, [file1.id, file2.id]);
  });

  it('submission-preview candidate.photo_url prefers profile selfie over NIN photo_url', async () => {
    if (!migrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const adminRow = await pool.query(`SELECT id FROM users WHERE email = 'admin@example.com' LIMIT 1`);
    const userId = adminRow.rows[0].id;
    const regId = await seedRegistrationForUser(userId);
    if (!regId) return;

    const selfieUrl = 'http://example.com/preferred-selfie.jpg';
    const ninUrl = 'https://nin.example/expiring.jpg';
    await pool.query(
      `INSERT INTO profiles (user_id, profile_photo_url) VALUES ($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET profile_photo_url = EXCLUDED.profile_photo_url`,
      [userId, selfieUrl]
    );

    let ninId = null;
    try {
      const ninIns = await pool.query(
        `INSERT INTO jupeb_nin_verifications (
           nin_hash, nin_last4, provider, status, response_payload, requested_by
         ) VALUES ($1, '1234', 'mock', 'verified', $2::jsonb, $3)
         RETURNING id`,
        [
          `test-face-selfie-${regId}`,
          JSON.stringify({ photo_url: ninUrl, first_name: 'Ada', last_name: 'Lovelace' }),
          userId,
        ]
      );
      ninId = ninIns.rows[0].id;
      await pool.query(
        `UPDATE jupeb_registrations SET nin_verification_id = $2 WHERE id = $1`,
        [regId, ninId]
      );
    } catch {
      // Schema may differ in older DBs; skip preference assertion.
      await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
      return;
    }

    const res = await request(app)
      .get('/registration/me/submission-preview')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.candidate.photo_url).toBe(selfieUrl);

    await pool.query(`DELETE FROM jupeb_registrations WHERE id = $1`, [regId]);
    if (ninId) await pool.query(`DELETE FROM jupeb_nin_verifications WHERE id = $1`, [ninId]);
  });
});
