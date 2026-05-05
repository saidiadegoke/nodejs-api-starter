const router = require('express').Router();
const WebhookController = require('./controllers/webhook.controller');
const { body, param } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/** GET /webhooks — list your webhooks */
router.get('/', requireAuth, WebhookController.list);

/** POST /webhooks — create a webhook subscription */
router.post(
  '/',
  requireAuth,
  body('url').isURL().withMessage('A valid URL is required'),
  body('events').isArray({ min: 1 }).withMessage('Events must be a non-empty array'),
  validate,
  WebhookController.create
);

/** PUT /webhooks/:id — update */
router.put(
  '/:id',
  requireAuth,
  param('id').isUUID().withMessage('Invalid webhook ID'),
  validate,
  WebhookController.update
);

/** DELETE /webhooks/:id — delete */
router.delete(
  '/:id',
  requireAuth,
  param('id').isUUID().withMessage('Invalid webhook ID'),
  validate,
  WebhookController.delete
);

module.exports = router;
