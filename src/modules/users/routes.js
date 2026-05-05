const router = require('express').Router();
const UserController = require('./controllers/user.controller');
const UserProfileController = require('./controllers/user-profile.controller');
const UserActivityController = require('./controllers/user-activity.controller');
const AddressController = require('./controllers/address.controller');
const KYCController = require('./controllers/kyc.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   GET /api/users/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', requireAuth, UserProfileController.getMe);

/**
 * @route   PUT /api/users/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', requireAuth, UserProfileController.updateMe);

/**
 * @route   GET /api/users/me/stats
 * @desc    Get current user statistics
 * @access  Private
 */
router.get('/me/stats', requireAuth, UserProfileController.getStats);

/**
 * @route   GET /api/users/me/permissions
 * @desc    Get current user permissions
 * @access  Private
 */
router.get('/me/permissions', requireAuth, UserProfileController.getMyPermissions);

/**
 * @route   GET /api/users/me/activities
 * @desc    Get current user activities
 * @access  Private
 */
router.get('/me/activities', requireAuth, UserActivityController.getMyActivities);

/**
 * @route   DELETE /api/users/me/activities/:activity_id
 * @desc    Delete user activity
 * @access  Private
 */
router.delete('/me/activities/:activity_id', requireAuth, UserActivityController.deleteActivity);

/**
 * @route   GET /api/users/countries
 * @desc    Get list of countries
 * @access  Public
 */
router.get('/countries', UserProfileController.getCountries);

/**
 * @route   PUT /api/users/me/settings/notifications
 * @desc    Update notification settings
 * @access  Private
 */
router.put('/me/settings/notifications', requireAuth, UserProfileController.updateNotificationSettings);

/**
 * @route   GET /api/users/me/addresses
 * @desc    Get user addresses
 * @access  Private
 */
router.get('/me/addresses', requireAuth, AddressController.getAddresses);

/**
 * @route   POST /api/users/me/addresses
 * @desc    Add new address
 * @access  Private
 */
router.post('/me/addresses', requireAuth, AddressController.addAddress);

/**
 * @route   PUT /api/users/me/addresses/:address_id
 * @desc    Update address
 * @access  Private
 */
router.put('/me/addresses/:address_id', requireAuth, AddressController.updateAddress);

/**
 * @route   DELETE /api/users/me/addresses/:address_id
 * @desc    Delete address
 * @access  Private
 */
router.delete('/me/addresses/:address_id', requireAuth, AddressController.deleteAddress);

/**
 * @route   GET /api/users/me/kyc
 * @desc    Get KYC status
 * @access  Private
 */
router.get('/me/kyc', requireAuth, KYCController.getKYCStatus);

/**
 * @route   POST /api/users/me/kyc
 * @desc    Submit KYC documents
 * @access  Private
 */
router.post('/me/kyc', requireAuth, KYCController.submitKYC);

/**
 * @route   GET /api/users/:user_id
 * @desc    Get user by ID (public profile)
 * @access  Private
 */
router.get('/:user_id', requireAuth, UserProfileController.getUserById);

/**
 * @route   GET /api/users/:user_id/activities
 * @desc    Get user activities (public)
 * @access  Public
 */
router.get('/:user_id/activities', UserActivityController.getUserActivities);

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Admin
 */
router.get('/', requireAuth, UserController.getAllUsers);

module.exports = router;

