const User = require('../models/user.model');
const {
  resolveAdminRbacScope,
  assertUserAccessible,
} = require('../../admin/utils/admin-rbac-scope');

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

class UserService {
  /**
   * Get all users with pagination and optional search
   */
  static async getAllUsers(page = 1, limit = 10, q = null, actorUserId = null) {
    const scope = actorUserId ? await resolveAdminRbacScope(actorUserId) : { mode: 'full' };
    const universityId = scope.mode === 'institution' ? scope.universityId : null;

    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (safePage - 1) * safeLimit;
    const searchTerm = q ? String(q).trim() || null : null;

    const { rows, total } = await User.findAllPaginated({
      limit: safeLimit,
      offset,
      q: searchTerm,
      universityId,
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
    const user = await User.update(id, userData);
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
