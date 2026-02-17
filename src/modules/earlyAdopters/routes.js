const express = require('express');
const router = express.Router();
const earlyAdopterController = require('./controllers/earlyAdopter.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { requireRole } = require('../../shared/middleware/rbac.middleware');

// Public route - register early adopter
router.post('/register', earlyAdopterController.register);

// Admin routes - require authentication and admin role
router.get('/', authenticate, requireRole('admin', 'super_admin'), earlyAdopterController.getAll);
router.get('/:id', authenticate, requireRole('admin', 'super_admin'), earlyAdopterController.getById);
router.patch('/:id', authenticate, requireRole('admin', 'super_admin'), earlyAdopterController.update);

module.exports = router;

