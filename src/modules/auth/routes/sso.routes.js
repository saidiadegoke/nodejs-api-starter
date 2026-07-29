const express = require('express');
const router = express.Router();
const { requireAuth } = require('../../../shared/middleware/rbac.middleware');
const SsoController = require('../controllers/sso.controller');

router.get('/targets', requireAuth, SsoController.listTargets);
router.get('/launch/:targetApp', requireAuth, SsoController.launch);

module.exports = router;
