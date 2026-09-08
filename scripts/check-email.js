/**
 * Direct SMTP check — does email sending actually work?
 *
 *   node scripts/check-email.js [recipient]
 *
 * Defaults to sending to FROM_EMAIL, so it needs no argument and no third party.
 *
 * ## Why this exists alongside send-test-email.js
 *
 * `send-test-email.js` drives mail through `/auth/resend-otp`, which is the right test for
 * "does the OTP flow deliver". But it boots the express app, needs the database, and seeds a
 * user — so when it fails, the failure could be SMTP, the route, the OTP service, or Postgres.
 *
 * This one answers the narrower question with nothing else in the way: no app, no database.
 * It does two things in order, and the order is the diagnosis:
 *
 *   1. `transporter.verify()` — can we reach the server and authenticate?
 *   2. `sendEmail()` — does a real message, through the app's own worker and template, send?
 *
 * A failure at (1) is credentials, host, port or network. A failure at (2) with (1) passing is
 * the message itself: a rejected sender, a missing template, a size or content rule.
 *
 * ## The trap this is built around
 *
 * `sendEmail` returns `Promise.resolve(null)` — indistinguishable from success to a caller —
 * in three cases: SMTP not configured, no recipient, or `NODE_ENV=test`. So a green run of
 * the app proves nothing about mail. This script treats a `null` as a **failure to send** and
 * says which of the three caused it.
 */
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

// `sendEmail` no-ops under NODE_ENV=test unless forced. Forcing rather than rewriting the env
// keeps this honest about which guard it is stepping past.
if (process.env.NODE_ENV === 'test') {
  process.env.JUPEB_EMAIL_FORCE = '1';
}

const sendEmail = require('../src/shared/utils/sendEmail');

const TEMPLATE = 'otp-code.html';
const to = process.argv[2] || process.env.FROM_EMAIL;

/** Enough of a secret to recognise, not enough to use. */
const mask = (value) => {
  if (!value) return '(unset)';
  const s = String(value);
  if (s.length <= 4) return '*'.repeat(s.length);
  return s.slice(0, 2) + '*'.repeat(Math.max(3, s.length - 4)) + s.slice(-2);
};

const port = Number(process.env.SMTP_PORT) || 465;
// Mirrors emailWorker.js exactly. Printed because getting it wrong is the classic failure:
// 465 is implicit TLS, 587/25/2525 are STARTTLS, and hard-coding secure=true on 587 breaks
// the handshake before any message is attempted.
const secure = port === 465;

const missing = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASSWORD', 'FROM_EMAIL']
  .filter((k) => !process.env[k]);

console.log('SMTP check');
console.log('──────────────────────────────────────────────');
console.log(`  host       ${process.env.SMTP_HOST || '(unset)'}:${port}`);
console.log(`  secure     ${secure}  ${secure ? '(implicit TLS)' : '(STARTTLS upgrade)'}`);
console.log(`  user       ${mask(process.env.SMTP_USER)}`);
console.log(`  password   ${mask(process.env.SMTP_PASSWORD)}`);
console.log(`  from       ${process.env.FROM_EMAIL || '(unset)'}`);
console.log(`  to         ${to || '(unset)'}`);
console.log(`  template   ${TEMPLATE}`);
console.log(`  NODE_ENV   ${process.env.NODE_ENV || '(unset)'}${
  process.env.JUPEB_EMAIL_FORCE === '1' ? '  · JUPEB_EMAIL_FORCE=1 set, so sends are not suppressed' : ''
}`);
console.log('');

if (missing.length) {
  console.error(`✗ Not configured. Missing from .env: ${missing.join(', ')}`);
  // The consequence differs by variable, and only the first is silent.
  if (missing.includes('SMTP_HOST') || missing.includes('SMTP_USER')) {
    console.error('');
    console.error('  Without SMTP_HOST or SMTP_USER, mail does not fail in the app — it');
    console.error('  silently no-ops. sendEmail returns null, which callers cannot');
    console.error('  distinguish from a successful send.');
  }
  if (missing.includes('SMTP_PASSWORD')) {
    console.error('');
    console.error('  Without SMTP_PASSWORD the connection is attempted and rejected at');
    console.error('  authentication.');
  }
  if (missing.includes('FROM_EMAIL')) {
    console.error('');
    console.error('  Without FROM_EMAIL the message goes out with an undefined sender and');
    console.error('  is rejected by most providers. It is also this script\'s default');
    console.error('  recipient, so pass one as an argument to test without it.');
  }
  process.exit(2);
}

const templatePath = path.join(__dirname, '..', 'src', 'shared', 'emails', TEMPLATE);
if (!fs.existsSync(templatePath)) {
  console.error(`✗ Template missing: ${templatePath}`);
  console.error('  The worker reads templates from src/shared/emails and throws if absent.');
  process.exit(2);
}

(async () => {
  // ── 1. Can we reach the server and authenticate? ────────────────────────
  process.stdout.write('1. Connecting and authenticating… ');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
  });

  try {
    await transporter.verify();
    console.log('ok');
  } catch (err) {
    console.log('FAILED');
    console.error('');
    console.error(`✗ Could not establish an authenticated SMTP session: ${err.message}`);
    if (err.code) console.error(`  code: ${err.code}`);
    if (err.responseCode) console.error(`  server response code: ${err.responseCode}`);
    console.error('');
    // The three that account for almost every real failure here.
    if (err.code === 'EAUTH') {
      console.error('  EAUTH is credentials. Check SMTP_USER and SMTP_PASSWORD. If the');
      console.error('  provider requires an app-specific password, the account password will');
      console.error('  fail here even though it works in a webmail login.');
    } else if (err.code === 'EDNS' || err.code === 'ENOTFOUND') {
      console.error(`  The hostname "${process.env.SMTP_HOST}" does not resolve. Check SMTP_HOST`);
      console.error('  for a typo.');
    } else if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.error(`  Nothing answered on ${process.env.SMTP_HOST}:${port}. Check the host,`);
      console.error('  the port, and whether outbound SMTP is blocked from this network.');
    } else if (/wrong version number|SSL/i.test(err.message)) {
      console.error(`  This reads like a TLS mismatch. Port ${port} was treated as`);
      console.error(`  secure=${secure}; 465 needs implicit TLS and 587 needs STARTTLS.`);
    }
    transporter.close();
    process.exit(1);
  }
  transporter.close();

  // ── 2. Does a real message go, through the app's own path? ──────────────
  process.stdout.write("2. Sending through the app's sendEmail worker… ");
  const startedAt = Date.now();
  let messageId;
  try {
    messageId = await sendEmail({
      to,
      subject: `SMTP check — ${new Date().toISOString()}`,
      templateFile: TEMPLATE,
      placeholders: {
        appName: process.env.APP_NAME || 'Reg Portal',
        firstName: 'there',
        code: '000000',
        email: to,
        ttlMinutes: '10',
        year: String(new Date().getFullYear()),
      },
    });
  } catch (err) {
    console.log('FAILED');
    console.error('');
    console.error(`✗ The server accepted a session but rejected the message: ${err.message}`);
    console.error('  Step 1 passed, so this is the message rather than the connection —');
    console.error('  commonly a FROM_EMAIL the provider will not send on behalf of.');
    process.exit(1);
  }

  const ms = Date.now() - startedAt;

  // A null resolve is the trap this script exists for: it is not a send.
  if (!messageId) {
    console.log('NOT SENT');
    console.error('');
    console.error('✗ sendEmail resolved null, which means nothing was sent.');
    console.error('  It returns null without error when SMTP_HOST or SMTP_USER is unset,');
    console.error('  when there is no recipient, or when NODE_ENV=test and');
    console.error('  JUPEB_EMAIL_FORCE is not 1. Configuration passed the checks above, so');
    console.error(`  NODE_ENV is the likely cause — it is currently "${process.env.NODE_ENV}".`);
    process.exit(1);
  }

  console.log(`ok (${ms} ms)`);
  console.log('');
  console.log('✓ Email sending works.');
  console.log(`  message id: ${messageId}`);
  console.log(`  delivered to the ${process.env.SMTP_HOST} queue for ${to}.`);
  console.log('');
  console.log('  An accepted message is not a delivered one — check the inbox and the spam');
  console.log('  folder. If it never arrives despite this passing, the problem is downstream:');
  console.log('  the provider, SPF/DKIM on the sending domain, or the recipient.');
  process.exit(0);
})();
