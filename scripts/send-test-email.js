/**
 * SMTP smoke test by way of the live HTTP endpoint.
 *
 *   node scripts/send-test-email.js [recipient]
 *
 * Boots the express app in-process and POSTs to `/auth/resend-otp`,
 * which exercises the full stack:
 *   route → validators → controller → OtpService → DB insert
 *     → sendEmail worker → SMTP → recipient inbox.
 *
 * If the recipient isn't already a user, the script seeds a temporary
 * one (and deletes it on exit) so the endpoint actually dispatches —
 * without that, /auth/resend-otp returns its account-enumeration-safe
 * fake response and no real mail is sent.
 *
 * Defaults to rasheedsaidi@gmail.com.
 */
require('dotenv').config();

// `sendEmail` short-circuits in NODE_ENV=test, so force a non-test env.
process.env.NODE_ENV = process.env.NODE_ENV === 'test' ? 'development' : (process.env.NODE_ENV || 'development');

const request = require('supertest');
const app = require('../src/app');
const pool = require('../src/db/pool');

const to = process.argv[2] || 'rasheedsaidi@gmail.com';

function require_(name) {
  if (!process.env[name]) {
    console.error(`✗ Missing ${name} in .env — aborting.`);
    process.exit(1);
  }
}

require_('SMTP_HOST');
require_('SMTP_USER');
require_('SMTP_PASSWORD');
require_('FROM_EMAIL');

console.log('--- /auth/resend-otp smoke test ---');
console.log(`From:     ${process.env.FROM_EMAIL}`);
console.log(`Host:     ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
console.log(`To:       ${to}`);
console.log(`Channel:  ${process.env.OTP_CHANNEL || 'email (default)'}`);
console.log('');

(async () => {
  let seededUserId = null;
  let exitCode = 0;
  try {
    // Look up the recipient; seed a temp user if they don't exist.
    let existing = await pool.query(
      `SELECT id, email, email_verified FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL LIMIT 1`,
      [to]
    );
    if (existing.rows.length === 0) {
      console.log('• No matching user — seeding a temporary one for this run.');
      const seed = await pool.query(
        `INSERT INTO users (email, password_hash, status, email_verified)
         VALUES ($1, '$2a$10$0', 'active', FALSE)
         RETURNING id, email`,
        [to]
      );
      seededUserId = seed.rows[0].id;
      console.log(`• Seeded user_id=${seededUserId}`);
    } else {
      console.log(`• Found existing user_id=${existing.rows[0].id} (email_verified=${existing.rows[0].email_verified})`);
    }

    // Fire the endpoint.
    const t0 = Date.now();
    const res = await request(app)
      .post('/auth/resend-otp')
      .send({ identifier: to });
    const ms = Date.now() - t0;

    console.log('');
    console.log(`HTTP ${res.status}  (${ms} ms)`);
    console.log('Response body:');
    console.log(JSON.stringify(res.body, null, 2));

    if (res.status !== 200) {
      console.error('\n✗ Endpoint did not return 200');
      exitCode = 1;
    } else if (!res.body.data || !res.body.data.sent) {
      console.error('\n✗ Response did not flag sent=true');
      exitCode = 1;
    } else if (!Array.isArray(res.body.data.channels) || !res.body.data.channels.includes('email')) {
      console.warn('\n⚠  Response did not include the email channel — was the user actually seeded?');
      exitCode = 1;
    } else {
      console.log('\n✓ Endpoint accepted the request and queued the email.');
      console.log('  (Sends are fire-and-forget; the response returns before SMTP completes.)');
      console.log('  Check the recipient inbox + spam folder. Server logs will warn on failure.');
      // Give the background worker time to actually deliver before
      // exit; otherwise the worker thread is killed mid-handshake.
      console.log('\n  Waiting up to 20s for the worker to flush…');
      await new Promise((r) => setTimeout(r, 20000));
    }
  } catch (err) {
    console.error('\n✗ Script failed:', err && err.message);
    exitCode = 1;
  } finally {
    if (seededUserId) {
      try {
        await pool.query(`DELETE FROM otp_codes WHERE user_id = $1`, [seededUserId]);
        await pool.query(`DELETE FROM users WHERE id = $1`, [seededUserId]);
        console.log(`• Cleaned up seeded user_id=${seededUserId}`);
      } catch (e) {
        console.warn('• Cleanup failed:', e.message);
      }
    }
    // Give the email worker thread + open DB connections a moment to
    // tear down cleanly before we exit.
    setTimeout(() => process.exit(exitCode), 500);
  }
})();
