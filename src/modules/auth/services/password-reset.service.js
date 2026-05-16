/**
 * Password reset — supports two delivery shapes:
 *
 *   - kind='token' (existing flow, unchanged behaviorally): email a link
 *     with a long random token. Redeemed by POSTing the raw token.
 *   - kind='otp' (new): email and/or SMS a 6-digit code. Redeemed by
 *     POSTing { identifier, code }. Better fit for mobile.
 *
 * Both kinds live in the same `password_resets` table, discriminated by
 * the `kind` column added in migration 015. token_hash holds sha256 of
 * either the long token or the 6-digit code; OTP redemption is scoped
 * to user_id so the small code space isn't brute-forceable across users.
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../../../db/pool');
const sendEmail = require('../../../shared/utils/sendEmail');
const smsRegistry = require('./sms-providers');

const TOKEN_TTL_MS = 15 * 60 * 1000;
const OTP_LENGTH = 6;
const OTP_MAX_ATTEMPTS = 5;

function appName() {
  return process.env.APP_NAME || 'Registration Portal';
}

function frontendUrl() {
  return process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function otpTtlMs() {
  const mins = Number(process.env.OTP_TTL_MINUTES) || 10;
  return Math.max(1, mins) * 60 * 1000;
}

function hashSha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function generateOtp() {
  return String(crypto.randomInt(0, 10 ** OTP_LENGTH)).padStart(OTP_LENGTH, '0');
}

function resolveOtpChannel(explicit, user) {
  const raw = (explicit || process.env.OTP_CHANNEL || '').toLowerCase();
  if (['email', 'sms', 'both'].includes(raw)) return raw;
  // Sensible default when the caller didn't say: prefer SMS for
  // phone-only users, email otherwise.
  if (user.email && user.phone) return 'both';
  if (user.phone) return 'sms';
  return 'email';
}

function maskRecipient(value) {
  if (!value) return '***';
  const s = String(value);
  if (s.includes('@')) return s.replace(/^(.{1,2})[^@]*(@.*)$/, '$1***$2');
  if (s.length > 6) return `${s.slice(0, 4)}***${s.slice(-2)}`;
  return '***';
}

function dispatchOtpEmail({ user, code }) {
  if (!user.email) return;
  const ttlMinutes = Math.round(otpTtlMs() / 60000);
  sendEmail({
    to: user.email,
    subject: `${appName()} — your password reset code: ${code}`,
    templateFile: 'otp-code.html',
    placeholders: {
      appName: appName(),
      firstName: user.first_name || 'there',
      code,
      ttlMinutes,
      email: user.email,
      year: new Date().getUTCFullYear(),
    },
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[password-reset.email] send failed:', err && err.message);
  });
}

function dispatchOtpSms({ user, code }) {
  if (!user.phone) return;
  const providerName = smsRegistry.resolveName();
  const provider = smsRegistry.get(providerName);
  const ttlMinutes = Math.round(otpTtlMs() / 60000);
  const message = `${appName()}: your password reset code is ${code}. Expires in ${ttlMinutes} minutes.`;
  Promise.resolve(provider.sendSms({ phone: user.phone, message }))
    .then((result) => {
      if (result && result.outcome !== 'sent') {
        // eslint-disable-next-line no-console
        console.warn(
          `[password-reset.sms:${providerName}] outcome=${result.outcome} error=${result.error_message || result.error_code || 'unknown'}`
        );
      }
    })
    .catch((err) => {
      // eslint-disable-next-line no-console
      console.warn(`[password-reset.sms:${providerName}] send failed:`, err && err.message);
    });
}

function dispatchTokenEmail({ user, rawToken }) {
  if (!user.email) return;
  const resetUrl = `${frontendUrl()}/reset-password?token=${rawToken}`;
  sendEmail({
    to: user.email,
    subject: `Reset Your ${appName()} Password`,
    templateFile: 'forgot-password.html',
    placeholders: [
      user.first_name || user.display_name || 'User',
      resetUrl,
      resetUrl,
      user.email,
    ],
  }).catch((err) => {
    // eslint-disable-next-line no-console
    console.warn('[password-reset.tokenEmail] send failed:', err && err.message);
  });
}

async function loadUserForReset(identifier) {
  const AuthModel = require('../models/auth.model');
  const user = await AuthModel.findByIdentifier(identifier);
  if (!user) return null;
  // Pull first_name for nicer email/sms copy.
  const r = await pool.query(
    `SELECT first_name FROM profiles WHERE user_id = $1 LIMIT 1`,
    [user.id]
  );
  user.first_name = (r.rows[0] && r.rows[0].first_name) || null;
  return user;
}

/**
 * Issue a fresh reset for the user. Returns response-safe metadata.
 *
 * delivery: 'token' (default) | 'otp'
 * channel : only used for OTP — 'email' | 'sms' | 'both' (default: env or
 *           user-shape-derived).
 */
async function issueReset({ user, delivery = 'token', channel, ipAddress, userAgent }) {
  if (delivery !== 'token' && delivery !== 'otp') {
    const err = new Error("delivery must be 'token' or 'otp'");
    err.status = 422;
    throw err;
  }

  if (delivery === 'token') {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashSha256(rawToken);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
    await pool.query(
      `INSERT INTO password_resets
         (user_id, token_hash, email, phone, method, kind, ip_address, user_agent, expires_at)
       VALUES ($1, $2, $3, $4, $5, 'token', $6, $7, $8)`,
      [
        user.id,
        tokenHash,
        user.email,
        user.phone,
        user.email ? 'email' : 'sms',
        ipAddress || null,
        userAgent || null,
        expiresAt,
      ]
    );
    if (user.email) {
      setImmediate(() => dispatchTokenEmail({ user, rawToken }));
    }
    return {
      delivery: 'token',
      channels: user.email ? ['email'] : ['sms'],
      expires_at: expiresAt.toISOString(),
      masked_recipient: maskRecipient(user.email || user.phone),
      // Never returned outside test mode — same convention as otp.service.
      ...(process.env.NODE_ENV === 'test' ? { token: rawToken } : {}),
    };
  }

  // delivery === 'otp'
  const resolvedChannel = resolveOtpChannel(channel, user);
  if (resolvedChannel === 'email' && !user.email) {
    const err = new Error('User has no email on file for OTP delivery');
    err.status = 422;
    err.error_code = 'email_required';
    throw err;
  }
  if (resolvedChannel === 'sms' && !user.phone) {
    const err = new Error('User has no phone on file for OTP delivery');
    err.status = 422;
    err.error_code = 'phone_required';
    throw err;
  }
  const code = generateOtp();
  const codeHash = hashSha256(code);
  const expiresAt = new Date(Date.now() + otpTtlMs());

  // Invalidate any active OTP rows for this user before inserting the
  // new one — same one-active-at-a-time semantics as otp.service.
  await pool.query(
    `UPDATE password_resets SET used_at = NOW()
      WHERE user_id = $1 AND kind = 'otp' AND used_at IS NULL`,
    [user.id]
  );
  await pool.query(
    `INSERT INTO password_resets
       (user_id, token_hash, email, phone, method, kind, ip_address, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5, 'otp', $6, $7, $8)`,
    [
      user.id,
      codeHash,
      user.email,
      user.phone,
      resolvedChannel === 'sms' ? 'sms' : 'email',
      ipAddress || null,
      userAgent || null,
      expiresAt,
    ]
  );

  setImmediate(() => {
    if (resolvedChannel === 'email' || resolvedChannel === 'both') {
      dispatchOtpEmail({ user, code });
    }
    if (resolvedChannel === 'sms' || resolvedChannel === 'both') {
      dispatchOtpSms({ user, code });
    }
  });

  const channels = [];
  if (resolvedChannel === 'email' || resolvedChannel === 'both') channels.push('email');
  if (resolvedChannel === 'sms' || resolvedChannel === 'both') channels.push('sms');

  return {
    delivery: 'otp',
    channels,
    expires_at: expiresAt.toISOString(),
    masked_recipient: maskRecipient(channels.includes('email') ? user.email : user.phone),
    ...(process.env.NODE_ENV === 'test' ? { code } : {}),
  };
}

/**
 * Redeem a long token (existing flow). Returns the user + reset row on
 * success, throws with err.status / err.error_code on failure.
 */
async function redeemToken(rawToken, newPassword) {
  if (!rawToken) {
    const err = new Error('Reset token is required');
    err.status = 400;
    err.error_code = 'token_required';
    throw err;
  }
  if (!newPassword || newPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 422;
    err.error_code = 'weak_password';
    throw err;
  }
  const tokenHash = hashSha256(rawToken);
  const r = await pool.query(
    `SELECT pr.*, u.id AS user_id, u.email, p.first_name
       FROM password_resets pr
       JOIN users u ON u.id = pr.user_id
       LEFT JOIN profiles p ON p.user_id = u.id
      WHERE pr.token_hash = $1 AND pr.kind = 'token'
        AND pr.expires_at > NOW() AND pr.used_at IS NULL
      LIMIT 1`,
    [tokenHash]
  );
  const reset = r.rows[0];
  if (!reset) {
    const err = new Error('Invalid or expired reset link. Please request a new one.');
    err.status = 400;
    err.error_code = 'invalid_or_expired_token';
    throw err;
  }
  await applyPasswordChange(reset.user_id, reset.id, newPassword);
  return { user_id: reset.user_id, email: reset.email, first_name: reset.first_name };
}

/**
 * Redeem an OTP. identifier resolves the user; OTP is checked against the
 * latest active row for that user. Mismatches increment attempt_count;
 * after OTP_MAX_ATTEMPTS the row is consumed (used_at set) so the user
 * has to request a fresh code.
 */
async function redeemOtp({ identifier, code, newPassword }) {
  if (!identifier) {
    const err = new Error('identifier (email or phone) is required');
    err.status = 422;
    err.error_code = 'identifier_required';
    throw err;
  }
  if (!code || !/^\d{6}$/.test(String(code).trim())) {
    const err = new Error('A 6-digit code is required');
    err.status = 422;
    err.error_code = 'otp_invalid_format';
    throw err;
  }
  if (!newPassword || newPassword.length < 8) {
    const err = new Error('Password must be at least 8 characters');
    err.status = 422;
    err.error_code = 'weak_password';
    throw err;
  }
  const user = await loadUserForReset(identifier);
  if (!user) {
    // Don't leak existence — same response shape as a valid-but-wrong code.
    const err = new Error('Invalid or expired reset code');
    err.status = 400;
    err.error_code = 'invalid_or_expired_otp';
    throw err;
  }
  const r = await pool.query(
    `SELECT id, token_hash, expires_at, attempt_count
       FROM password_resets
      WHERE user_id = $1 AND kind = 'otp' AND used_at IS NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    [user.id]
  );
  const row = r.rows[0];
  if (!row) {
    const err = new Error('No active reset code. Request a new one.');
    err.status = 410;
    err.error_code = 'otp_expired_or_missing';
    throw err;
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    const err = new Error('Reset code expired. Request a new one.');
    err.status = 410;
    err.error_code = 'otp_expired';
    throw err;
  }
  if (row.attempt_count >= OTP_MAX_ATTEMPTS) {
    // Burn the row so it can't be brute-forced further.
    await pool.query(`UPDATE password_resets SET used_at = NOW() WHERE id = $1`, [row.id]);
    const err = new Error('Too many attempts. Request a new code.');
    err.status = 429;
    err.error_code = 'too_many_attempts';
    throw err;
  }
  if (row.token_hash !== hashSha256(String(code).trim())) {
    await pool.query(
      `UPDATE password_resets SET attempt_count = attempt_count + 1 WHERE id = $1`,
      [row.id]
    );
    const err = new Error('Invalid or expired reset code');
    err.status = 400;
    err.error_code = 'invalid_or_expired_otp';
    throw err;
  }
  await applyPasswordChange(user.id, row.id, newPassword);
  return { user_id: user.id, email: user.email, first_name: user.first_name };
}

async function applyPasswordChange(userId, resetId, newPassword) {
  const newHash = await bcrypt.hash(newPassword, 10);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [newHash, userId]
    );
    await client.query(
      `UPDATE password_resets SET used_at = NOW() WHERE id = $1`,
      [resetId]
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  loadUserForReset,
  issueReset,
  redeemToken,
  redeemOtp,
  // exported for tests
  _hashSha256: hashSha256,
  _generateOtp: generateOtp,
};
