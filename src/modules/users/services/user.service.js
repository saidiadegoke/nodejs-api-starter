const User = require('../models/user.model');

class UserService {
  /**
   * Get all users with pagination and optional search
   */
  static async getAllUsers(page = 1, limit = 10, q = null) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (safePage - 1) * safeLimit;
    const searchTerm = q ? String(q).trim() : null;
    const users = await User.findAll(safeLimit, offset, searchTerm);
    const total = await User.count(searchTerm);

    return { users, total, page: safePage, limit: safeLimit };
  }

  /**
   * Get user by ID
   */
  static async getUserById(id) {
    const user = await User.findById(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Create new user
   */
  static async createUser(userData) {
    // Check if user already exists
    const existingUser = await User.findByEmail(userData.email);
    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    // In production, hash the password here
    // userData.password_hash = await bcrypt.hash(userData.password, 10);

    const user = await User.create(userData);
    return user;
  }

  /**
   * Update user
   */
  static async updateUser(id, userData) {
    const user = await User.update(id, userData);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }

  /**
   * Delete user
   */
  static async deleteUser(id) {
    const user = await User.delete(id);
    if (!user) {
      throw new Error('User not found');
    }
    return user;
  }
}

module.exports = UserService;


