/**
 * Provision an institution_admin user bound to a JUPEB university.
 * Used when creating an institution (catalog); login email = institution email.
 */
const crypto = require('crypto');
const pool = require('../../../db/pool');
const AuthModel = require('../../auth/models/auth.model');
const UserUniversityModel = require('../../../utils/models/user-university.model');
const jupebMailer = require('./jupeb-mailer.service');

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const DIGIT = '23456789';
const SPECIAL = '!@#$%&*';

/** Meets institution portal rules: ≥8 chars, uppercase, lowercase, special. */
function generatePassword(length = 12) {
  const len = Math.max(8, length);
  const pick = (set) => set[crypto.randomInt(0, set.length)];
  const pool = UPPER + LOWER + DIGIT + SPECIAL;
  const chars = [pick(UPPER), pick(LOWER), pick(SPECIAL)];
  for (let i = chars.length; i < len; i += 1) {
    chars.push(pick(pool));
  }
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const j = crypto.randomInt(0, i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
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
    const existingBinding = await UserUniversityModel.findPrimary(existing.id);
    if (!existingBinding) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const binding = await UserUniversityModel.bind(
          {
            userId: existing.id,
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
          [existing.id, university_id]
        );
        await client.query('COMMIT');
        return {
          user: existing,
          passwordPlaintext: null,
          binding,
          first_name: existing.first_name || null,
          last_name: existing.last_name || null,
        };
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

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
    password: passwordPlaintext,
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

const bcrypt = require('bcryptjs');

/**
 * Resend welcome credentials email to an institution admin.
 * Generates a fresh temporary password, updates the user's password_hash,
 * and sends the credentials template.
 */
async function resendInstitutionAdminCredentials(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    throw httpError(422, 'email is required');
  }

  const query = `
    SELECT u.id, u.email, p.first_name, p.last_name, p.jupeb_university_id,
           COALESCE(uni.name, uni_by_email.name) AS university_name
      FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN user_universities uu ON uu.user_id = u.id AND uu.deleted_at IS NULL
      LEFT JOIN jupeb_universities uni ON uni.id = uu.university_id OR uni.id = p.jupeb_university_id
      LEFT JOIN jupeb_universities uni_by_email ON LOWER(uni_by_email.email) = LOWER(u.email)
     WHERE LOWER(u.email) = $1 AND u.deleted_at IS NULL
     LIMIT 1
  `;
  const result = await pool.query(query, [normalizedEmail]);
  if (!result.rows.length) {
    throw httpError(404, 'Institution admin user not found with this email');
  }

  const user = result.rows[0];
  const passwordPlaintext = generatePassword(12);
  const passwordHash = await bcrypt.hash(passwordPlaintext, 10);

  await pool.query(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, user.id]
  );

  const firstName = user.first_name || 'Admin';
  const universityName = user.university_name || 'your institution';

  await jupebMailer.sendInstitutionAdminCredentials({
    email: user.email,
    password: passwordPlaintext,
    firstName,
    universityName,
  });

  return {
    user_id: user.id,
    email: user.email,
    first_name: firstName,
    university_name: universityName,
  };
}

module.exports = {
  provisionInstitutionAdmin,
  provisionInstitutionAdminOnUniversityCreate,
  resendInstitutionAdminCredentials,
  generatePassword,
};
