const router = require('express').Router();
const AuthController = require('./controllers/auth.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   POST /api/auth/register
 * @desc    Register new user
 * @access  Public
 */
router.post(
  '/register',
  [
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone')
      .optional()
      .matches(/^(\+)?\d{8,20}$/)
      .withMessage('Valid phone number is required (8-20 digits, optional + prefix)'),
    body('country_id').optional().isInt().withMessage('Valid country ID is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('first_name').notEmpty().withMessage('First name is required'),
    body('last_name').notEmpty().withMessage('Last name is required'),
    body('role').isIn(['user', 'b2b']).withMessage('Invalid role'),
    // Custom validation: at least one of email or phone must be provided
    body().custom((value, { req }) => {
      if (!req.body.email && !req.body.phone) {
        throw new Error('Either email or phone is required');
      }
      return true;
    }),
    validate,
  ],
  AuthController.register
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post(
  '/login',
  [
    body('identifier').notEmpty().withMessage('Email or phone is required'),
    body('password').notEmpty().withMessage('Password is required'),
    validate,
  ],
  AuthController.login
);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh access token
 * @access  Public
 */
router.post(
  '/refresh-token',
  [
    body('refresh_token').notEmpty().withMessage('Refresh token is required'),
    validate,
  ],
  AuthController.refreshToken
);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user
 * @access  Private
 */
router.post('/logout', requireAuth, AuthController.logout);

/**
 * @route   POST /api/auth/verify-phone
 * @desc    Verify phone number with OTP
 * @access  Public
 */
router.post(
  '/verify-phone',
  [
    body('phone')
      .notEmpty()
      .withMessage('Phone number is required')
      .matches(/^(\+)?\d{8,20}$/)
      .withMessage('Valid phone number format required (8-20 digits, optional + prefix)'),
    body('otp').notEmpty().withMessage('OTP is required'),
    validate,
  ],
  AuthController.verifyPhone
);

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Resend OTP
 * @access  Public
 */
router.post(
  '/resend-otp',
  [
    body('phone')
      .notEmpty()
      .withMessage('Phone number is required')
      .matches(/^(\+)?\d{8,20}$/)
      .withMessage('Valid phone number format required (8-20 digits, optional + prefix)'),
    validate,
  ],
  AuthController.resendOtp
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Initiate password reset
 * @access  Public
 */
router.post(
  '/forgot-password',
  [
    body('identifier').notEmpty().withMessage('Email or phone is required'),
    validate,
  ],
  AuthController.forgotPassword
);

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password with code
 * @access  Public
 */
router.post(
  '/reset-password',
  [
    body('identifier').notEmpty().withMessage('Email or phone is required'),
    body('reset_code').notEmpty().withMessage('Reset code is required'),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    validate,
  ],
  AuthController.resetPassword
);

/**
 * @route   POST /api/auth/change-password
 * @desc    Change password (logged in)
 * @access  Private
 */
router.post(
  '/change-password',
  requireAuth,
  [
    body('current_password').notEmpty().withMessage('Current password is required'),
    body('new_password').isLength({ min: 8 }).withMessage('New password must be at least 8 characters'),
    validate,
  ],
  AuthController.changePassword
);

module.exports = router;

