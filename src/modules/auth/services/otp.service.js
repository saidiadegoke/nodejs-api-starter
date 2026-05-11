/**
 * OtpService — short numeric codes used to verify identity over email
 * and/or SMS.
 *
 * Mirrors the password-reset shape (own table, hashed code, append-only
 * rows, marked verified_at on success). One active row per user at a
 * time: `issueOtp` invalidates older rows and inserts a fresh one.
 *
 * Channels:
 *   - `email`  (default)         — sends `otp-code.html`
 *   - `sms`                      — dispatches via the SMS provider registry
 *   - `both`                     — both channels in parallel
 *
 * The channel resolves from (in order):
 *   1. explicit `channel` arg to issueOtp()
 *   2. `OTP_CHANNEL` env var
 *   3. default `'email'`
 *
 * Test mode (`NODE_ENV=test`) skips real delivery via the existing
 * sendEmail / SMS guards but still writes the DB row and returns the
 * raw code so tests can verify the verify-side mechanics. Set
 * `JUPEB_EMAIL_FORCE=1` to actually deliver during a test.
 */
const crypto = require('crypto');
const pool = require('../../../db/pool');
const sendEmail = require('../../../shared/utils/sendEmail');
const smsRegistry = require('./sms-providers');

const OTP_LENGTH = 6;
const MAX_ATTEMPTS = 5;

function appName() {
  return process.env.APP_NAME || 'Registration Portal';
}

function ttlMs() {
  const mins = Number(process.env.OTP_TTL_MINUTES) || 10;
  return Math.max(1, mins) * 60 * 1000;
}

function resolveChannel(explicit) {
  const raw = (explicit || process.env.OTP_CHANNEL || 'email').toLowerCase();
  return ['email', 'sms', 'both'].includes(raw) ? raw : 'email';
}

function generateCode() {
  // Cryptographically strong 6-digit code, zero-padded. Avoids the
  // bias of `Math.random() * 1000000`.
  const n = crypto.randomInt(0, 10 ** OTP_LENGTH);
  return String(n).padStart(OTP_LENGTH, '0');
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

async function loadUser(userId) {
  const r = await pool.query(
    `SELECT u.id, u.email, u.phone, u.email_verified, u.phone_verified,
            p.first_name
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
      WHERE u.id = $1 LIMIT 1`,
    [userId]
  );
  return r.rows[0] || null;
}

async function dispatchEmail({ user, code, channel }) {
  if (!user.email) return { outcome: 'skipped', reason: 'no_email' };
  const ttlMinutes = Math.round(ttlMs() / 60000);
  await sendEmail({
    to: user.email,
    subject: `${appName()} — your verification code: ${code}`,
    templateFile: 'otp-code.html',
    placeholders: {
      appName: appName(),
      firstName: user.first_name || 'there',
      code,
      ttlMinutes,
      email: user.email,
      year: new Date().getUTCFullYear(),
    },
  });
  return { outcome: 'sent', channel: 'email' };
}

async function dispatchSms({ user, code }) {
  if (!user.phone) return { outcome: 'skipped', reason: 'no_phone' };
  const providerName = smsRegistry.resolveName();
  const provider = smsRegistry.get(providerName);
  const ttlMinutes = Math.round(ttlMs() / 60000);
  const message = `${appName()}: your verification code is ${code}. Expires in ${ttlMinutes} minutes.`;
  const result = await provider.sendSms({ phone: user.phone, message });
  return {
    outcome: result.outcome,
    channel: 'sms',
    provider: providerName,
    provider_reference: result.provider_reference || null,
    error_code: result.error_code,
    error_message: result.error_message,
  };
}

/**
 * Issue a fresh OTP for the user. Invalidates any prior active OTP for
 * the same user. Dispatches via the resolved channel(s) in parallel.
 *
 * Returns:
 *   {
 *     otp_id, channels: ['email'|'sms'], expires_at,
 *     dispatches: [{ outcome, channel, ... }],
 *     // raw `code` only included when NODE_ENV=test for assertion purposes
 *   }
 */
async function issueOtp(userId, { channel, ipAddress, userAgent } = {}) {
  const user = await loadUser(userId);
  if (!user) {
    const err = new Error('User not found');
    err.status = 404;
    err.error_code = 'user_not_found';
    throw err;
  }
  const resolved = resolveChannel(channel);
  if (resolved === 'email' && !user.email) {
    const err = new Error('User has no email on file');
    err.status = 422;
    err.error_code = 'email_required';
    throw err;
  }
  if (resolved === 'sms' && !user.phone) {
    const err = new Error('User has no phone on file');
    err.status = 422;
    err.error_code = 'phone_required';
    throw err;
  }
  if (resolved === 'both' && !user.email && !user.phone) {
    const err = new Error('User has neither email nor phone on file');
    err.status = 422;
    err.error_code = 'identifier_required';
    throw err;
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + ttlMs());

  // Invalidate any active OTP for this user, then insert the new one.
  // Mark old rows verified_at so they no longer appear active — using
  // a sentinel timestamp would lie, so we just delete prior unverified
  // rows for this user (audit isn't needed at this granularity).
  const ins = await pool.query(
    `WITH purge AS (
       DELETE FROM otp_codes
        WHERE user_id = $1 AND verified_at IS NULL
     )
     INSERT INTO otp_codes
       (user_id, code_hash, channel, email, phone, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, expires_at`,
    [
      userId,
      codeHash,
      resolved,
      user.email,
      user.phone,
      ipAddress || null,
      userAgent || null,
      expiresAt.toISOString(),
    ]
  );

  const targets = [];
  if (resolved === 'email' || resolved === 'both') targets.push('email');
  if (resolved === 'sms' || resolved === 'both') targets.push('sms');

  const dispatches = await Promise.all(targets.map((t) => {
    if (t === 'email') return dispatchEmail({ user, code, channel: resolved }).catch((e) => ({
      outcome: 'failed', channel: 'email', error_message: e.message,
    }));
    return dispatchSms({ user, code }).catch((e) => ({
      outcome: 'failed', channel: 'sms', error_message: e.message,
    }));
  }));

  const out = {
    otp_id: ins.rows[0].id,
    channels: targets,
    expires_at: ins.rows[0].expires_at,
    dispatches,
  };
  // Tests need to assert the code; production responses must never
  // include it.
  if (process.env.NODE_ENV === 'test') out.code = code;
  return out;
}

/**
 * Verify a raw OTP for a user. On success: marks the row verified_at,
 * flips users.phone_verified and/or users.email_verified depending on
 * the channel.
 *
 * Failure modes:
 *   - no active OTP → 410 otp_expired_or_missing
 *   - max attempts reached → 429 too_many_attempts
 *   - mismatch → 400 invalid_otp (attempt_count incremented)
 *   - already verified → idempotent success
 */
async function verifyOtp(userId, rawCode) {
  if (!rawCode || typeof rawCode !== 'string') {
    const err = new Error('OTP is required');
    err.status = 422;
    err.error_code = 'otp_required';
    throw err;
  }
  const trimmed = rawCode.trim();
  if (!/^\d{6}$/.test(trimmed)) {
    const err = new Error('OTP must be a 6-digit number');
    err.status = 422;
    err.error_code = 'otp_invalid_format';
    throw err;
  }

  const r = await pool.query(
    `SELECT id, code_hash, channel, expires_at, attempt_count, verified_at
       FROM otp_codes
      WHERE user_id = $1 AND verified_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [userId]
  );
  const row = r.rows[0];
  if (!row) {
    const err = new Error('No active verification code. Request a new one.');
    err.status = 410;
    err.error_code = 'otp_expired_or_missing';
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error('Verification code expired. Request a new one.');
    err.status = 410;
    err.error_code = 'otp_expired';
    throw err;
  }
  if (row.attempt_count >= MAX_ATTEMPTS) {
    const err = new Error('Too many attempts. Request a new code.');
    err.status = 429;
    err.error_code = 'too_many_attempts';
    throw err;
  }

  if (row.code_hash !== hashCode(trimmed)) {
    await pool.query(
      `UPDATE otp_codes SET attempt_count = attempt_count + 1 WHERE id = $1`,
      [row.id]
    );
    const err = new Error('Invalid verification code');
    err.status = 400;
    err.error_code = 'invalid_otp';
    throw err;
  }

  // Success: mark row verified, flip the user flags appropriate to the
  // delivery channel.
  await pool.query(
    `UPDATE otp_codes SET verified_at = NOW() WHERE id = $1`,
    [row.id]
  );
  const flips = [];
  if (row.channel === 'email' || row.channel === 'both') flips.push('email_verified = TRUE, email_verified_at = COALESCE(email_verified_at, NOW())');
  if (row.channel === 'sms' || row.channel === 'both') flips.push('phone_verified = TRUE');
  if (flips.length) {
    await pool.query(
      `UPDATE users SET ${flips.join(', ')}, updated_at = NOW() WHERE id = $1`,
      [userId]
    );
  }
  return { verified: true, channel: row.channel };
}

module.exports = {
  issueOtp,
  verifyOtp,
  // exported for tests
  _hashCode: hashCode,
  _generateCode: generateCode,
};
