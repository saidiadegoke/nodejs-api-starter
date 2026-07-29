const express = require('express');
const router = express.Router();
const SsoController = require('../controllers/sso.controller');

router.get('/.well-known/jwks.json', SsoController.getJwks);

module.exports = router;
