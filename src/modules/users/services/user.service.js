const UserModel = require('../models/user.model');

class UserService {
  static async getAllUsers(options) {
    const users = await UserModel.find(options);
    const total = await UserModel.count(options);
    const page = parseInt(options.page || 1, 10);
    const limit = parseInt(options.limit || 20, 10);
    return {
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  static async getUserById(id) {
    return UserModel.findById(id);
  }

  static async updateUser(id, data) {
    return UserModel.update(id, data);
  }

  static async activateUser(id) {
    return UserModel.update(id, { status: 'active' });
  }

  static async deactivateUser(id) {
    return UserModel.update(id, { status: 'inactive' });
  }

  static async deleteUser(id) {
    return UserModel.delete(id);
  }
}

module.exports = UserService;
