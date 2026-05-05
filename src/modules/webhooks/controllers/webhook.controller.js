const WebhookService = require('../services/webhook.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND } = require('../../../shared/constants/statusCodes');

class WebhookController {
  static async list(req, res) {
    try {
      const webhooks = await WebhookService.list(req.user.user_id);
      sendSuccess(res, webhooks, 'Webhooks retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async create(req, res) {
    try {
      const webhook = await WebhookService.create(req.user.user_id, req.body);
      sendSuccess(res, webhook, 'Webhook created successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  static async update(req, res) {
    try {
      const webhook = await WebhookService.update(req.params.id, req.user.user_id, req.body);
      sendSuccess(res, webhook, 'Webhook updated successfully', OK);
    } catch (error) {
      sendError(
        res,
        error.message,
        error.message === 'Webhook not found' ? NOT_FOUND : BAD_REQUEST
      );
    }
  }

  static async delete(req, res) {
    try {
      await WebhookService.delete(req.params.id, req.user.user_id);
      sendSuccess(res, null, 'Webhook deleted successfully', OK);
    } catch (error) {
      sendError(
        res,
        error.message,
        error.message === 'Webhook not found' ? NOT_FOUND : BAD_REQUEST
      );
    }
  }
}

module.exports = WebhookController;
