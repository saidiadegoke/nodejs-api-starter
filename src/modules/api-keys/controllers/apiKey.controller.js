const ApiKeyService = require('../services/apiKey.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class ApiKeyController {
  static async generate(req, res) {
    try {
      const { name } = req.body;
      const key = await ApiKeyService.generate(req.user.user_id, name);
      sendSuccess(
        res,
        key,
        'API key created successfully. Store the key securely — it will not be shown again.',
        CREATED
      );
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async list(req, res) {
    try {
      const keys = await ApiKeyService.list(req.user.user_id);
      sendSuccess(res, keys, 'API keys retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async revoke(req, res) {
    try {
      const key = await ApiKeyService.revoke(req.params.id, req.user.user_id);
      sendSuccess(res, key, 'API key revoked successfully', OK);
    } catch (error) {
      sendError(res, error.message, NOT_FOUND);
    }
  }
}

module.exports = ApiKeyController;
