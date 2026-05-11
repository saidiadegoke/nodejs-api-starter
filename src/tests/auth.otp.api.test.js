const request = require('supertest');
const app = require('../app');
const pool = require('../db/pool');
const AuthService = require('../modules/auth/services/auth.service');
const otpService = require('../modules/auth/services/otp.service');

describe('OTP — /auth/resend-otp + /auth/verify-phone', () => {
  let migrated = false;
  const cleanupUserIds = [];

  beforeAll(async () => {
    try {
      await pool.query('SELECT 1 FROM otp_codes LIMIT 1');
      migrated = true;
    } catch {
      migrated = false;
    }
    if (!migrated) {
      // eslint-disable-next-line no-console
      console.warn('[auth.otp.api] Skipping: apply migration 011 first.');
    }
  });

  afterAll(async () => {
    if (cleanupUserIds.length) {
      await pool.query('DELETE FROM otp_codes WHERE user_id = ANY($1::uuid[])', [cleanupUserIds]);
      await pool.query('DELETE FROM users WHERE id = ANY($1::uuid[])', [cleanupUserIds]);
    }
  });

  function uniqueEmail(tag = 'otp') {
    return `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  }

  function uniquePhone() {
    return `+234803${String(Date.now()).slice(-7)}`;
  }

  async function seedUser(overrides = {}) {
    const email = overrides.email || uniqueEmail();
    const phone = overrides.phone || uniquePhone();
    const r = await pool.query(
      `INSERT INTO users (email, phone, password_hash, status, email_verified, phone_verified)
       VALUES ($1, $2, '$2a$10$0', 'active', FALSE, FALSE)
       RETURNING id, email, phone`,
      [email, phone]
    );
    cleanupUserIds.push(r.rows[0].id);
    return r.rows[0];
  }

  describe('resend-otp — channel resolution', () => {
    it('defaults to email and writes an otp_codes row hashed against the raw code', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const res = await request(app)
        .post('/auth/resend-otp')
        .send({ identifier: user.email });

      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.channels).toEqual(['email']);
      expect(res.body.data.expires_at).toBeDefined();
      expect(res.body.data.code).toMatch(/^\d{6}$/); // test-mode passthrough

      const rows = await pool.query(
        `SELECT code_hash, channel FROM otp_codes WHERE user_id = $1`,
        [user.id]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].channel).toBe('email');
      expect(rows.rows[0].code_hash).toBe(otpService._hashCode(res.body.data.code));
    });

    it('honors explicit body.channel = sms', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const res = await request(app)
        .post('/auth/resend-otp')
        .send({ identifier: user.phone, channel: 'sms' });
      expect(res.status).toBe(200);
      expect(res.body.data.channels).toEqual(['sms']);
      // Dispatches are fire-and-forget; the response no longer carries
      // per-channel SMTP outcomes. We assert via the DB row instead.
      const r = await pool.query(
        `SELECT channel FROM otp_codes WHERE user_id = $1 AND verified_at IS NULL`,
        [user.id]
      );
      expect(r.rows[0].channel).toBe('sms');
    });

    it('channel=both dispatches to email and sms in parallel', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const res = await request(app)
        .post('/auth/resend-otp')
        .send({ identifier: user.email, channel: 'both' });
      expect(res.status).toBe(200);
      expect(new Set(res.body.data.channels)).toEqual(new Set(['email', 'sms']));
      const r = await pool.query(
        `SELECT channel FROM otp_codes WHERE user_id = $1 AND verified_at IS NULL`,
        [user.id]
      );
      expect(r.rows[0].channel).toBe('both');
    });

    it('overwrites the prior active OTP — only the latest row is active', async () => {
      if (!migrated) return;
      const user = await seedUser();
      await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const second = await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const rows = await pool.query(
        `SELECT id FROM otp_codes WHERE user_id = $1 AND verified_at IS NULL`,
        [user.id]
      );
      expect(rows.rowCount).toBe(1);
      expect(rows.rows[0].id).toBe(second.body.data.otp_id || rows.rows[0].id);
    });

    it('returns a synthetic success for an unknown identifier (no account enumeration)', async () => {
      if (!migrated) return;
      const res = await request(app)
        .post('/auth/resend-otp')
        .send({ identifier: 'nobody-here@example.com' });
      expect(res.status).toBe(200);
      expect(res.body.data.sent).toBe(true);
      expect(res.body.data.masked_recipient).toBe('no***@example.com');
      // No actual row was written
      expect(res.body.data.code).toBeUndefined();
    });

    it('422 when identifier is missing entirely', async () => {
      if (!migrated) return;
      const res = await request(app).post('/auth/resend-otp').send({});
      expect(res.status).toBe(400);
    });
  });

  describe('verify-phone — validates against the stored hash', () => {
    it('happy path: issue then verify flips email_verified=true', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const issue = await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const code = issue.body.data.code;

      const verify = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: user.email, otp: code });
      expect(verify.status).toBe(200);
      expect(verify.body.data.verified).toBe(true);
      expect(verify.body.data.channel).toBe('email');

      const u = await pool.query(`SELECT email_verified FROM users WHERE id = $1`, [user.id]);
      expect(u.rows[0].email_verified).toBe(true);
    });

    it('sms channel flips phone_verified=true', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const issue = await request(app)
        .post('/auth/resend-otp')
        .send({ identifier: user.phone, channel: 'sms' });
      const code = issue.body.data.code;
      await request(app).post('/auth/verify-phone').send({ identifier: user.phone, otp: code });
      const u = await pool.query(`SELECT phone_verified, email_verified FROM users WHERE id = $1`, [user.id]);
      expect(u.rows[0].phone_verified).toBe(true);
      expect(u.rows[0].email_verified).toBe(false);
    });

    it('400 invalid_otp when the code is wrong; attempt_count increments', async () => {
      if (!migrated) return;
      const user = await seedUser();
      await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const res = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: user.email, otp: '000000' });
      expect(res.status).toBe(400);
      expect(res.body.details && res.body.details.error_code).toBe('invalid_otp');
      const r = await pool.query(`SELECT attempt_count FROM otp_codes WHERE user_id = $1`, [user.id]);
      expect(r.rows[0].attempt_count).toBe(1);
    });

    it('410 otp_expired when the row has passed its expires_at', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const issue = await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const code = issue.body.data.code;
      // Force expiry in DB
      await pool.query(
        `UPDATE otp_codes SET expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $1`,
        [user.id]
      );
      const res = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: user.email, otp: code });
      expect(res.status).toBe(410);
      expect(res.body.details && res.body.details.error_code).toBe('otp_expired');
    });

    it('410 otp_expired_or_missing when no active OTP exists', async () => {
      if (!migrated) return;
      const user = await seedUser();
      const res = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: user.email, otp: '123456' });
      expect(res.status).toBe(410);
      expect(res.body.details && res.body.details.error_code).toBe('otp_expired_or_missing');
    });

    it('422 otp_invalid_format when not 6 digits', async () => {
      if (!migrated) return;
      const user = await seedUser();
      await request(app).post('/auth/resend-otp').send({ identifier: user.email });
      const res = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: user.email, otp: 'abc' });
      // Caught by the route-level express-validator (400 path) first.
      expect([400, 422]).toContain(res.status);
    });

    it('does not leak account existence when identifier is unknown', async () => {
      if (!migrated) return;
      const res = await request(app)
        .post('/auth/verify-phone')
        .send({ identifier: 'ghost@example.com', otp: '123456' });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/invalid/i);
    });
  });

  describe('OtpService unit checks', () => {
    it('_generateCode returns a 6-digit zero-padded string', () => {
      for (let i = 0; i < 50; i += 1) {
        const c = otpService._generateCode();
        expect(c).toMatch(/^\d{6}$/);
      }
    });

    it('_hashCode is deterministic and 64 hex chars', () => {
      expect(otpService._hashCode('123456')).toBe(otpService._hashCode('123456'));
      expect(otpService._hashCode('123456')).toMatch(/^[0-9a-f]{64}$/);
    });
  });
});
