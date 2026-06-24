const UserService = require('../services/user.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const {
  OK,
  CREATED,
  BAD_REQUEST,
  NOT_FOUND,
  INTERNAL_SERVER_ERROR,
} = require('../../../shared/constants/statusCodes');

class UserController {
  /**
   * Get all users
   */
  static async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 10, q } = req.query;
      const result = await UserService.getAllUsers(page, limit, q, req.user && req.user.user_id);
      sendPaginated(res, result.users, result.page, result.limit, result.total);
    } catch (error) {
      sendError(res, error.message, error.status || BAD_REQUEST);
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(req, res) {
    try {
      const user = await UserService.getUserById(req.params.userId, req.user && req.user.user_id);
      sendSuccess(res, user, 'User retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, error.status || NOT_FOUND);
    }
  }

  /**
   * Create new user
   */
  static async createUser(req, res) {
    try {
      const user = await UserService.createUser(req.body);
      sendSuccess(res, user, 'User created successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, error.status || BAD_REQUEST);
    }
  }

  /**
   * Update user
   */
  static async updateUser(req, res) {
    try {
      const user = await UserService.updateUser(
        req.params.userId,
        req.body,
        req.user && req.user.user_id
      );
      sendSuccess(res, user, 'User updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, error.status || BAD_REQUEST);
    }
  }

  static async deleteUser(req, res) {
    try {
      await UserService.deleteUser(req.params.userId, req.user && req.user.user_id);
      sendSuccess(res, null, 'User deleted successfully', OK);
    } catch (error) {
      sendError(res, error.message, error.status || BAD_REQUEST);
    }
  }
}

module.exports = UserController;
