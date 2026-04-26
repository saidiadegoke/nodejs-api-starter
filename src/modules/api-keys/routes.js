const router = require('express').Router();
const ApiKeyController = require('./controllers/apiKey.controller');
const { body, param } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/** POST /api-keys — generate a new key (full key returned once) */
router.post(
  '/',
  requireAuth,
  body('name').notEmpty().withMessage('API key name is required'),
  validate,
  ApiKeyController.generate
);

/** GET /api-keys — list your keys (no hashes) */
router.get('/', requireAuth, ApiKeyController.list);

/** DELETE /api-keys/:id — revoke a key */
router.delete(
  '/:id',
  requireAuth,
  param('id').isUUID().withMessage('Invalid API key ID'),
  validate,
  ApiKeyController.revoke
);

module.exports = router;
