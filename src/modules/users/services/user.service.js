const User = require('../models/user.model');
const {
  resolveAdminRbacScope,
  assertUserAccessible,
} = require('../../admin/utils/admin-rbac-scope');
const { normalizeStatus } = require('../../../shared/utils/status');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class UserService {
  /**
   * Get all users with pagination, optional search, and role exclusions/filters
   */
  static async getAllUsers(page = 1, limit = 10, q = null, actorUserId = null, options = {}) {
    const scope = actorUserId ? await resolveAdminRbacScope(actorUserId) : { mode: 'full' };
    const universityId = scope.mode === 'institution' ? scope.universityId : null;

    const {
      role = null,
      include_all = false,
      include_students = false,
      include_institution = false,
      exclude_roles = null,
    } = options;

    const isIncludeAll = include_all === true || include_all === 'true' || include_all === '1';
    const isIncludeStudents = include_students === true || include_students === 'true' || include_students === '1';
    const isIncludeInstitution = include_institution === true || include_institution === 'true' || include_institution === '1';

    let excludeRoleNames = [];
    let excludeInstitutionRoles = false;
    let excludeGlobalRoleNames = [];

    if (scope.mode === 'institution') {
      excludeGlobalRoleNames = ['institution_admin'];
    } else {
      if (!isIncludeAll && !role) {
        if (!isIncludeStudents) {
          excludeRoleNames.push('student');
        }
        if (!isIncludeInstitution) {
          excludeRoleNames.push('institution_admin', 'program_director');
          excludeInstitutionRoles = true;
        }
      }
    }

    if (exclude_roles) {
      const extraExcludes = Array.isArray(exclude_roles)
        ? exclude_roles
        : String(exclude_roles).split(',').map((r) => r.trim()).filter(Boolean);
      excludeRoleNames = Array.from(new Set([...excludeRoleNames, ...extraExcludes]));
    }

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (safePage - 1) * safeLimit;
    const searchTerm = q ? String(q).trim() || null : null;

    const { rows, total } = await User.findAllPaginated({
      limit: safeLimit,
      offset,
      q: searchTerm,
      universityId,
      role: role ? String(role).trim() : null,
      excludeGlobalRoleNames,
      excludeRoleNames,
      excludeInstitutionRoles,
    });

    return { users: rows, total, page: safePage, limit: safeLimit };
  }

  /**
   * Get user by ID
   */
  static async getUserById(id, actorUserId = null) {
    const user = await User.findById(id);
    if (!user) {
      throw httpError(404, 'User not found');
    }
    if (actorUserId) {
      const scope = await resolveAdminRbacScope(actorUserId);
      assertUserAccessible(user, scope);
    }
    return user;
  }

  /**
   * Create new user
   */
  static async createUser(userData) {
    const existingUser = await User.findByEmail(userData.email);
    if (existingUser) {
      throw httpError(409, 'User with this email already exists');
    }

    const user = await User.create(userData);
    return user;
  }

  /**
   * Update user
   */
  static async updateUser(id, userData, actorUserId = null) {
    if (actorUserId) {
      await UserService.getUserById(id, actorUserId);
    }
    const payload = { ...userData };
    if (payload.status !== undefined) {
      const norm = normalizeStatus(payload.status);
      if (!norm) {
        throw httpError(422, 'status must be active or inactive');
      }
      payload.status = norm;
    } else if (payload.is_active !== undefined) {
      payload.status = payload.is_active ? 'active' : 'inactive';
    }
    const user = await User.update(id, payload);
    if (!user) {
      throw httpError(404, 'User not found');
    }
    return user;
  }

  /**
   * Delete user
   */
  static async deleteUser(id, actorUserId = null) {
    if (actorUserId) {
      await UserService.getUserById(id, actorUserId);
    }
    const user = await User.delete(id);
    if (!user) {
      throw httpError(404, 'User not found');
    }
    return user;
  }
}

module.exports = UserService;
