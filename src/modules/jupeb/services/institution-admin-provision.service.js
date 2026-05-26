/**
 * Provision an institution_admin user bound to a JUPEB university.
 * Used when creating an institution (catalog); login email = institution email.
 */
const crypto = require('crypto');
const pool = require('../../../db/pool');
const AuthModel = require('../../auth/models/auth.model');
const UserUniversityModel = require('../../../shared/models/user-university.model');
const jupebMailer = require('./jupeb-mailer.service');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function generatePassword(length = 12) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i += 1) {
    out += chars[bytes[i] % chars.length];
  }
  return out;
}

function httpError(status, message, details) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

/**
 * After POST /catalog/universities: create institution_admin for body.email.
 *
 * @returns {Promise<{ institution_admin: object, provisionedUserId: string }>}
 */
async function provisionInstitutionAdminOnUniversityCreate(body, {
  university_id,
  universityName,
  createdBy,
}) {
  const loginEmail = String(body.email || '').trim();
  if (!loginEmail) {
    throw httpError(422, 'email is required');
  }
  if (!EMAIL_RE.test(loginEmail)) {
    throw httpError(422, 'Invalid email address');
  }

  const provisioned = await provisionInstitutionAdmin({
    email: loginEmail,
    first_name: body.admin_first_name,
    last_name: body.admin_last_name,
    university_id,
    createdBy,
  });

  setImmediate(() => {
    jupebMailer.sendInstitutionAdminCredentials({
      email: provisioned.user.email,
      password: provisioned.passwordPlaintext,
      firstName: provisioned.first_name || 'Admin',
      universityName: universityName || 'your institution',
    });
  });

  return {
    provisionedUserId: provisioned.user.id,
    institution_admin: {
      user_id: provisioned.user.id,
      email: provisioned.user.email,
      first_name: provisioned.first_name,
      last_name: provisioned.last_name,
    },
  };
}

/**
 * @param {object} params
 * @param {string} params.email
 * @param {string} [params.first_name]
 * @param {string} [params.last_name]
 * @param {string} params.university_id
 * @param {string} [params.createdBy]
 * @returns {Promise<{ user: object, passwordPlaintext: string, binding: object }>}
 */
async function provisionInstitutionAdmin({
  email,
  first_name,
  last_name,
  university_id,
  createdBy = null,
}) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw httpError(422, 'email is required to provision an institution admin');
  }
  if (!EMAIL_RE.test(normalizedEmail)) {
    throw httpError(422, 'Invalid email address');
  }

  const existing = await AuthModel.findByIdentifier(normalizedEmail);
  if (existing) {
    const err = httpError(409, 'User with this email already exists');
    err.details = {
      error_code: 'duplicate',
      field: 'email',
      value: normalizedEmail,
    };
    throw err;
  }

  const passwordPlaintext = generatePassword(12);
  const firstName = first_name ? String(first_name).trim() : '';
  const lastName = last_name ? String(last_name).trim() : '';
  const user = await AuthModel.createUser({
    email: normalizedEmail,
    phone: null,
    password: 'password',
    first_name: firstName,
    last_name: lastName,
    role: 'institution_admin',
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const binding = await UserUniversityModel.bind(
      {
        userId: user.id,
        universityId: university_id,
        role: 'institution_admin',
        isPrimary: true,
        createdBy,
      },
      client
    );
    await client.query(
      `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW()
       WHERE user_id = $1`,
      [user.id, university_id]
    );
    await client.query('COMMIT');
    return {
      user,
      passwordPlaintext,
      binding,
      first_name: firstName || null,
      last_name: lastName || null,
    };
  } catch (err) {
    await client.query('ROLLBACK');
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  provisionInstitutionAdmin,
  provisionInstitutionAdminOnUniversityCreate,
  generatePassword,
};
