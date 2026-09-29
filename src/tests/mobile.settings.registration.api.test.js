const request = require('supertest');
const app = require('../app');
const pool = require('../database/pool');
const {
  closeAllOpenJupebSessions,
  nextJupebTestPrefix,
  nextJupebTestUniversityCode,
  nextJupebAcademicSession,
} = require('./jupeb-session-test-helpers');

describe('Mobile settings + registration facades', () => {
  let preferencesMigrated = false;
  let registrationMigrated = false;
  let pdfkitAvailable = false;

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM user_preferences LIMIT 1');
      preferencesMigrated = true;
    } catch {
      // Apply migration inline for local test DBs that lag behind files.
      try {
        const fs = require('fs');
        const path = require('path');
        const sql = fs.readFileSync(
          path.join(__dirname, '../db/migrations/028_user_preferences.sql'),
          'utf8'
        );
        await pool.query(sql);
        await pool.query(
          `INSERT INTO schema_migrations (migration_name)
           VALUES ('028_user_preferences.sql')
           ON CONFLICT DO NOTHING`
        );
        preferencesMigrated = true;
      } catch (err) {
        preferencesMigrated = false;
        // eslint-disable-next-line no-console
        console.warn('[mobile.settings] preferences migration unavailable:', err.message);
      }
    }

    try {
      await pool.query('SELECT 1 FROM jupeb_registrations LIMIT 1');
      registrationMigrated = true;
    } catch {
      registrationMigrated = false;
    }

    try {
      // eslint-disable-next-line global-require, import/no-unresolved
      require('pdfkit');
      pdfkitAvailable = true;
    } catch {
      pdfkitAvailable = false;
    }
  });

  async function getAdminToken() {
    const res = await request(app)
      .post('/auth/login')
      .send({ identifier: 'admin@example.com', password: 'Admin@12' });
    return res.body.data?.access_token || null;
  }

  it('GET/PATCH /users/me/preferences persist flags', async () => {
    if (!preferencesMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    const get1 = await request(app)
      .get('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(get1.status).toBe(200);
    expect(get1.body.data).toHaveProperty('push_notifications_enabled');
    expect(get1.body.data).toHaveProperty('biometric_login_enabled');

    const patch = await request(app)
      .patch('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        push_notifications_enabled: false,
        biometric_login_enabled: true,
      });
    expect(patch.status).toBe(200);
    expect(patch.body.data).toEqual({
      push_notifications_enabled: false,
      biometric_login_enabled: true,
    });

    const get2 = await request(app)
      .get('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`);
    expect(get2.body.data.biometric_login_enabled).toBe(true);

    // Restore defaults so other tests are unaffected
    await request(app)
      .patch('/users/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        push_notifications_enabled: true,
        biometric_login_enabled: false,
      });
  });

  it('DELETE /users/me requires confirmation and soft-deletes', async () => {
    if (!preferencesMigrated) return;
    const token = await getAdminToken();
    if (!token) return;

    // Create a disposable user via signup/login is heavy; insert directly.
    const bcrypt = require('bcryptjs');
    const email = `delete-me-${Date.now()}@example.com`;
    const hash = await bcrypt.hash('DeleteMe@12', 10);
    const userIns = await pool.query(
      `INSERT INTO users (email, password_hash, status)
       VALUES ($1, $2, 'active')
       RETURNING id`,
      [email, hash]
    );
    const userId = userIns.rows[0].id;
    await pool.query(
      `INSERT INTO profiles (user_id, first_name, last_name)
       VALUES ($1, 'Delete', 'Me')`,
      [userId]
    );
    const role = await pool.query(`SELECT id FROM roles WHERE name = 'user' LIMIT 1`);
    if (role.rows[0]) {
      await pool.query(
        `INSERT INTO user_roles (user_id, role_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
        [userId, role.rows[0].id]
      );
    }

    const login = await request(app)
      .post('/auth/login')
      .send({ identifier: email, password: 'DeleteMe@12' });
    expect(login.status).toBe(200);
    const userToken = login.body.data.access_token;

    const bad = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ confirmation: 'please' });
    expect(bad.status).toBe(422);

    const ok = await request(app)
      .delete('/users/me')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ confirmation: 'DELETE' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toEqual({ deleted: true });

    const row = await pool.query(
      `SELECT deleted_at, status FROM users WHERE id = $1`,
      [userId]
    );
    expect(row.rows[0].deleted_at).not.toBeNull();

    const sessions = await pool.query(
      `SELECT COUNT(*)::int AS c FROM user_sessions
        WHERE user_id = $1 AND is_revoked = false`,
      [userId]
    );
    expect(sessions.rows[0].c).toBe(0);
  });

  it('notifications support filter/per_page and PATCH read aliases', async () => {
    const token = await getAdminToken();
    if (!token) return;

    const admin = await pool.query(
      `SELECT id FROM users WHERE email = 'admin@example.com' AND deleted_at IS NULL LIMIT 1`
    );
    if (!admin.rows[0]) return;
    const userId = admin.rows[0].id;

    const created = await pool.query(
      `INSERT INTO notifications (user_id, type, message, metadata, read)
       VALUES ($1, 'reminder', 'Mathematics Class starts in 2 hours', $2::jsonb, false)
       RETURNING id`,
      [userId, JSON.stringify({ title: 'Upcoming Class Reminder' })]
    );
    const notificationId = created.rows[0].id;

    const list = await request(app)
      .get('/notifications')
      .query({ filter: 'unread', per_page: 10 })
      .set('Authorization', `Bearer ${token}`);
    expect(list.status).toBe(200);
    expect(list.body.data).toHaveProperty('items');
    expect(list.body.data).toHaveProperty('unread_count');
    expect(list.body.data.pagination).toHaveProperty('per_page');

    const patchOne = await request(app)
      .patch(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({ is_read: true });
    expect(patchOne.status).toBe(200);
    expect(patchOne.body.data).toEqual({ id: notificationId, is_read: true });

    const putCompat = await request(app)
      .put(`/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${token}`)
      .send({});
    expect(putCompat.status).toBe(200);

    const patchAll = await request(app)
      .patch('/notifications/read-all')
      .set('Authorization', `Bearer ${token}`);
    expect(patchAll.status).toBe(200);
    expect(patchAll.body.data).toHaveProperty('updated_count');

    await pool.query(`DELETE FROM notifications WHERE id = $1`, [notificationId]);
  });

  async function claimSubmittedRegistration(adminToken, tag) {
    let uniRes;
    for (let i = 0; i < 5; i += 1) {
      uniRes = await request(app)
        .post('/catalog/universities')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          code: nextJupebTestUniversityCode(tag),
          name: `${tag} Slip Uni`,
          short_name: `${tag}SU`,
          jupeb_prefix: nextJupebTestPrefix(),
          email: `${tag.toLowerCase()}-${Date.now()}@slip-test.edu.ng`,
        });
      if (uniRes.status === 201) break;
    }
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
      const { y1, academicYear, yearShort } = nextJupebAcademicSession();
      sessRes = await request(app)
        .post('/sessions')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          academic_year: academicYear,
          year_short: yearShort,
          opens_at: new Date(`${y1}-01-01T00:00:00.000Z`).toISOString(),
          closes_at: new Date(`${y1}-12-01T00:00:00.000Z`).toISOString(),
        });
      if (sessRes.status === 201) break;
    }
    await closeAllOpenJupebSessions(adminToken);
    await request(app)
      .post(`/sessions/${sessRes.body.data.id}/open`)
      .set('Authorization', `Bearer ${adminToken}`);
    const createReg = await request(app)
      .post('/registration/institution/registrations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        session_id: sessRes.body.data.id,
        university_id: uniRes.body.data.id,
        subject_combination_id: scRes.body.data.id,
      });
    expect(createReg.status).toBe(201);
    const regId = createReg.body.data.id;
    await request(app)
      .post('/registration/me/claim-code')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ institution_issued_code: createReg.body.data.institution_issued_code });

    // Force status so slip export is allowed without full submission flow.
    await pool.query(
      `UPDATE jupeb_registrations
          SET status = 'pending_institution_review', submitted_at = NOW()
        WHERE id = $1`,
      [regId]
    );
    return regId;
  }

  it('GET /registration/me/exam-results groups local O-level entries', async () => {
    if (!registrationMigrated) return;
    const token = await getAdminToken();
    if (!token) return;
    const regId = await claimSubmittedRegistration(token, 'MER');

    await pool.query(
      `INSERT INTO jupeb_result_entries
         (registration_id, source, sitting, serial, subject, grade, grade_normalized, origin)
       VALUES
         ($1, 'waec', 1, 1, 'Mathematics', 'A1', 'A', 'manual'),
         ($1, 'waec', 1, 2, 'English Language', 'B2', 'B', 'manual'),
         ($1, 'neco', 1, 1, 'Physics', 'C4', 'C', 'ocr')
       ON CONFLICT DO NOTHING`,
      [regId]
    );

    const all = await request(app)
      .get('/registration/me/exam-results')
      .set('Authorization', `Bearer ${token}`);
    expect(all.status).toBe(200);
    expect(Array.isArray(all.body.data.results)).toBe(true);
    expect(all.body.data.results.length).toBeGreaterThanOrEqual(2);

    const filtered = await request(app)
      .get('/registration/me/exam-results')
      .query({ source: 'waec', sitting: 1 })
      .set('Authorization', `Bearer ${token}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.results.every((r) => r.source === 'waec')).toBe(true);
    expect(filtered.body.data.results[0].grades[0]).toHaveProperty('sn');
  });

  it('GET /registration/me/slip returns signed download URL', async () => {
    if (!registrationMigrated || !pdfkitAvailable) return;
    const token = await getAdminToken();
    if (!token) return;
    await claimSubmittedRegistration(token, 'MSL');

    const slip = await request(app)
      .get('/registration/me/slip')
      .set('Authorization', `Bearer ${token}`);
    expect(slip.status).toBe(200);
    expect(slip.body.data.download_url).toContain('/registration/me/slip/download?token=');
    expect(slip.body.data.expires_at).toBeTruthy();

    const url = new URL(slip.body.data.download_url, 'http://localhost');
    const download = await request(app)
      .get('/registration/me/slip/download')
      .query({ token: url.searchParams.get('token') });
    expect(download.status).toBe(200);
    expect(download.headers['content-type']).toMatch(/pdf/);

    const expired = await request(app)
      .get('/registration/me/slip/download')
      .query({ token: 'not-a-real-token' });
    expect(expired.status).toBe(401);
  });
});
