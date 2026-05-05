#!/usr/bin/env node

/**
 * Set a user's password by email (operator / recovery CLI).
 * Usage: node scripts/set-user-password.js <email> <new_password>
 *   npm run rbac:set-user-password -- admin@example.com 'Admin@12'
 *
 * Uses bcrypt cost 10 (same as auth). New password must be at least 8 characters.
 * Does not print the new password. Requires DB_* env from .env (see other scripts/rbac tools).
 */

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

async function setUserPassword(email, newPassword) {
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    throw new Error('Provide a valid email address');
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters');
  }

  const normalized = email.trim().toLowerCase();
  const hash = await bcrypt.hash(newPassword, 10);

  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1, updated_at = NOW()
     WHERE LOWER(TRIM(email)) = $2 AND deleted_at IS NULL`,
    [hash, normalized]
  );

  if (result.rowCount === 0) {
    throw new Error(`No active user found with email matching: ${email}`);
  }

  console.log(`✅ Password updated for ${normalized}`);
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
🔧 Set user password (by email)
================================

Usage:
  node scripts/set-user-password.js <email> <new_password>
  npm run rbac:set-user-password -- <email> <new_password>

Examples:
  npm run rbac:set-user-password -- admin@example.com 'Admin@12'
  node scripts/set-user-password.js user@example.com 'NewSecure!99'

Notes:
  - Run from project root with .env loaded (DB_* variables).
  - Use single quotes around the password if it contains shell metacharacters.
  - Matches users by email (case-insensitive); soft-deleted users are skipped.
`);
    await pool.end();
    process.exit(0);
  }

  if (args.length < 2) {
    console.error('❌ Error: provide <email> and <new_password>');
    console.error('Usage: npm run rbac:set-user-password -- <email> <new_password>');
    await pool.end();
    process.exit(1);
  }

  try {
    const [userEmail, newPassword] = args;
    await setUserPassword(userEmail, newPassword);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
