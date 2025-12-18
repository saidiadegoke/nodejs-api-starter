const router = require('express').Router();
const UserController = require('./controllers/user.controller');
const UserProfileController = require('./controllers/user-profile.controller');
const UserActivityController = require('./controllers/user-activity.controller');
const UserPreferenceController = require('./controllers/user-preference.controller');
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
 * @route   GET /api/users/me/stories
 * @desc    Get current user's stories (context sources)
 * @access  Private
 */
router.get('/me/stories', requireAuth, UserProfileController.getUserStories);

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
 * @route   GET /api/users/me/preferences
 * @desc    Get user preferences
 * @access  Private
 */
router.get('/me/preferences', requireAuth, UserPreferenceController.getMyPreferences);

/**
 * @route   PUT /api/users/me/preferences
 * @desc    Update user preferences
 * @access  Private
 */
router.put('/me/preferences', requireAuth, UserPreferenceController.updateMyPreferences);

/**
 * @route   GET /api/users/me/feed-preferences
 * @desc    Get user feed preferences with interests
 * @access  Private
 */
router.get('/me/feed-preferences', requireAuth, UserPreferenceController.getMyFeedPreferences);

/**
 * @route   GET /api/users/me/interests/:type
 * @desc    Get user interests by type
 * @access  Private
 */
router.get('/me/interests/:type', requireAuth, UserPreferenceController.getMyInterests);

/**
 * @route   GET /api/users/me/category-distribution
 * @desc    Get user's category distribution from activity
 * @access  Private
 */
router.get('/me/category-distribution', requireAuth, UserPreferenceController.getMyCategoryDistribution);

/**
 * @route   POST /api/users/me/poll-interaction
 * @desc    Record poll interaction for interest tracking
 * @access  Private
 */
router.post('/me/poll-interaction', requireAuth, UserPreferenceController.recordPollInteraction);

/**
 * @route   POST /api/users/me/preferences/reset
 * @desc    Reset user preferences to defaults
 * @access  Private
 */
router.post('/me/preferences/reset', requireAuth, UserPreferenceController.resetMyPreferences);

/**
 * @route   GET /api/users/preferences/categories
 * @desc    Get available categories for preferences
 * @access  Public
 */
router.get('/preferences/categories', UserPreferenceController.getAvailableCategories);

/**
 * @route   GET /api/users/preferences/poll-types
 * @desc    Get available poll types for preferences
 * @access  Public
 */
router.get('/preferences/poll-types', UserPreferenceController.getAvailablePollTypes);

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

