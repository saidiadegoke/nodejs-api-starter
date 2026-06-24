const pool = require('../../../db/pool');
const AuthModel = require('../../auth/models/auth.model');
const UserUniversityModel = require('../../../shared/models/user-university.model');
const universityModel = require('../../jupeb/models/university.model');
const AdminUsersService = require('../services/adminUsers.service');
const { resolveAdminRbacScope } = require('../utils/admin-rbac-scope');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { CREATED, BAD_REQUEST, CONFLICT, UNPROCESSABLE_ENTITY, NOT_FOUND, INTERNAL_SERVER_ERROR } =
  require('../../../shared/constants/statusCodes');

const VALID_ROLES = [
  'super_admin',
  'admin',
  'agent',
  'user',
  'registrar',
  'program_director',
  'institution_admin',
  'financial_admin',
  'student',
];

class AdminUsersController {
  static async getStats(req, res) {
    try {
      const stats = await AdminUsersService.getStats(req.user && req.user.user_id);
      return sendSuccess(res, stats, 'User and role management stats');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * POST /admin/users
   *
   * Admin-side user creation. Atomically:
   *   1. creates users + profile rows (delegates to AuthModel.createUser)
   *   2. assigns the role
   *   3. binds user ↔ university via user_universities
   *   4. denormalizes profiles.jupeb_university_id when is_primary=true
   *      (default), so the existing institution-scope code keeps working.
   *
   * Body: {
   *   email?, phone?,         // at least one required
   *   password,               // min 8 chars
   *   first_name, last_name,
   *   role,                   // one of VALID_ROLES
   *   university_id?,          // jupeb_universities.id — optional; institution admins default to scope
   *   is_primary?: boolean,   // default true
   *   country_id?: int,       // for phone formatting
   * }
   *
   * Caller must hold the `users.create` permission. Single-uni-per-user
   * is enforced by the partial unique index on user_universities
   * (one active is_primary per user); a duplicate (user_id, university_id)
   * idempotently no-ops via ON CONFLICT.
   */
  static async createUserWithUniversity(req, res) {
    const body = req.body || {};
    const {
      email,
      phone,
      password,
      first_name,
      last_name,
      role,
      university_id: bodyUniversityId,
      is_primary = true,
      country_id,
    } = body;

    if (!email && !phone) {
      return sendError(res, 'Either email or phone is required', UNPROCESSABLE_ENTITY);
    }
    if (!password || String(password).length < 8) {
      return sendError(res, 'Password must be at least 8 characters', UNPROCESSABLE_ENTITY);
    }
    if (!first_name || !last_name) {
      return sendError(res, 'first_name and last_name are required', UNPROCESSABLE_ENTITY);
    }
    if (!role || !VALID_ROLES.includes(role)) {
      return sendError(
        res,
        `Valid role is required (${VALID_ROLES.join(', ')})`,
        UNPROCESSABLE_ENTITY
      );
    }

    try {
      const scope = req.user && req.user.user_id
        ? await resolveAdminRbacScope(req.user.user_id)
        : { mode: 'full' };

      let university_id = bodyUniversityId || null;
      if (!university_id && scope.mode === 'institution') {
        university_id = scope.universityId;
      }

      if (university_id && scope.mode === 'institution' && String(university_id) !== String(scope.universityId)) {
        return sendError(
          res,
          'Cannot create users for a university outside your institution scope',
          403
        );
      }

      let uni = null;
      if (university_id) {
        uni = await universityModel.findById(university_id);
        if (!uni || uni.status !== 'active') {
          return sendError(res, 'JUPEB university not found or inactive', NOT_FOUND);
        }
      }

      // Reuse the existing AuthModel.createUser (handles bcrypt + role
      // assignment + profile creation in its own transaction). We then
      // run the binding writes in a second transaction and roll back the
      // user only if the binding step blows up.
      const AuthService = require('../../auth/services/auth.service');
      const formattedPhone = await AuthService.formatPhoneNumber(phone, country_id);

      if (email || formattedPhone) {
        const existing = await AuthModel.findByIdentifier(email || formattedPhone);
        if (existing) {
          return sendError(res, 'User with this email or phone already exists', CONFLICT);
        }
      }

      const user = await AuthModel.createUser({
        email,
        phone: formattedPhone,
        password,
        first_name,
        last_name,
        role,
      });

      if (!university_id) {
        return sendSuccess(
          res,
          {
            user: {
              user_id: user.id,
              email: user.email,
              phone: user.phone,
              first_name,
              last_name,
              role,
              status: user.status,
              created_at: user.created_at,
            },
            university: null,
            binding: null,
          },
          'User created',
          CREATED
        );
      }

      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const binding = await UserUniversityModel.bind(
          {
            userId: user.id,
            universityId: university_id,
            role,
            isPrimary: !!is_primary,
            createdBy: req.user && req.user.user_id,
          },
          client
        );
        if (is_primary) {
          await client.query(
            `UPDATE profiles SET jupeb_university_id = $2, updated_at = NOW()
              WHERE user_id = $1`,
            [user.id, university_id]
          );
        }
        await client.query('COMMIT');

        return sendSuccess(
          res,
          {
            user: {
              user_id: user.id,
              email: user.email,
              phone: user.phone,
              first_name,
              last_name,
              role,
              status: user.status,
              created_at: user.created_at,
            },
            university: {
              id: uni.id,
              name: uni.name,
              short_name: uni.short_name,
            },
            binding: {
              id: binding.id,
              is_primary: binding.is_primary,
              role: binding.role,
            },
          },
          'User created and associated with university',
          CREATED
        );
      } catch (bindErr) {
        await client.query('ROLLBACK');
        // Roll back the user too — the request is "create + bind atomically".
        await pool
          .query(`DELETE FROM users WHERE id = $1`, [user.id])
          .catch(() => { /* best-effort cleanup */ });
        throw bindErr;
      } finally {
        client.release();
      }
    } catch (err) {
      if (err.code === '23505') {
        return sendError(res, 'User with this email or phone already exists', CONFLICT);
      }
      return sendError(res, err.message || 'Failed to create user', BAD_REQUEST);
    }
  }
}

module.exports = AdminUsersController;
