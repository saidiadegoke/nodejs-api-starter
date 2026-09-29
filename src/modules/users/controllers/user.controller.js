const UserService = require('../services/user.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../utils/utils/response');
const { OK, NOT_FOUND, BAD_REQUEST } = require('../../../utils/constants/statusCodes');

class UserController {
  static async getAllUsers(req, res) {
    try {
      const { users, pagination } = await UserService.getAllUsers(req.query);
      return sendPaginated(res, users, pagination, 'Users retrieved successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async getUserById(req, res) {
    try {
      const user = await UserService.getUserById(req.params.id);
      if (!user) return sendError(res, 'User not found', NOT_FOUND);
      return sendSuccess(res, user, 'User retrieved successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async updateUser(req, res) {
    try {
      const user = await UserService.updateUser(req.params.id, req.body);
      if (!user) return sendError(res, 'User not found', NOT_FOUND);
      return sendSuccess(res, user, 'User updated successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async activateUser(req, res) {
    try {
      const user = await UserService.activateUser(req.params.id);
      if (!user) return sendError(res, 'User not found', NOT_FOUND);
      return sendSuccess(res, user, 'User activated successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async deactivateUser(req, res) {
    try {
      const user = await UserService.deactivateUser(req.params.id);
      if (!user) return sendError(res, 'User not found', NOT_FOUND);
      return sendSuccess(res, user, 'User deactivated successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async deleteUser(req, res) {
    try {
      await UserService.deleteUser(req.params.id);
      return sendSuccess(res, null, 'User deleted successfully');
    } catch (error) {
      return sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = UserController;
