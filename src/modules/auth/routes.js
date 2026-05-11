const router = require('express').Router();
const AuthController = require('./controllers/auth.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');
const oauthRoutes = require('./routes/oauth.routes');

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
    body('role')
      .notEmpty()
      .isIn([
        'super_admin',
        'admin',
        'agent',
        'user',
        'registrar',
        'program_director',
        'institution_admin',
      ])
      .withMessage(
        'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)'
      ),
    body('referral_code').optional().trim().isLength({ max: 32 }).withMessage('Referral code must be at most 32 characters'),
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
 * @route   POST /api/auth/register-with-code
 * @desc    Single-shot signup using an institution-issued registration code (M.3)
 * @access  Public
 */
router.post(
  '/register-with-code',
  [
    body('code').isString().trim().notEmpty().withMessage('code is required'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    body('email').optional().isEmail().withMessage('Valid email is required'),
    body('phone')
      .optional()
      .matches(/^(\+)?\d{8,20}$/)
      .withMessage('Valid phone number is required (8-20 digits, optional + prefix)'),
    body('first_name').optional().isString().trim(),
    body('last_name').optional().isString().trim(),
    validate
  ],
  AuthController.registerWithCode
);

/**
 * @route   GET /api/auth/code-status
 * @desc    Public lookup — is this institution code valid? (M.9)
 * @access  Public
 */
router.get('/code-status', AuthController.codeStatus);

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
 * @route   POST /api/auth/send-verification
 * @desc    Issue (or re-issue) an email-verification link to the
 *          authenticated user. Idempotent — invalidates any prior link.
 * @access  Authenticated
 */
router.post('/send-verification', requireAuth, AuthController.sendVerification);

/**
 * @route   POST /api/auth/resend-verification
 * @desc    Same as /send-verification but uses the resend-* template.
 * @access  Authenticated
 */
router.post('/resend-verification', requireAuth, AuthController.resendVerification);

/**
 * @route   GET  /api/auth/verify-email?token=...
 * @route   POST /api/auth/verify-email   (body: { token })
 * @desc    Mark email_verified=true for whoever owns the supplied token.
 *          The query-string form is intentional — that's the URL the
 *          email link points at. POST is also accepted for SPA flows.
 * @access  Public
 */
router.get('/verify-email', AuthController.verifyEmail);
router.post('/verify-email', AuthController.verifyEmail);

/**
 * @route   POST /api/auth/verify-phone
 * @desc    Verify phone number with OTP
 * @access  Public
 */
router.post(
  '/verify-phone',
  [
    // Either an `identifier` (email | phone), or the legacy `phone`
    // field, must be present. Validate inside the handler so we can
    // accept either shape without a brittle express-validator OR chain.
    body('otp')
      .notEmpty().withMessage('OTP is required')
      .matches(/^\d{6}$/).withMessage('OTP must be 6 digits'),
    validate,
  ],
  AuthController.verifyPhone
);

/**
 * @route   POST /api/auth/resend-otp
 * @desc    Issue a fresh 6-digit OTP and dispatch it via the configured
 *          channel (email | sms | both — see OTP_CHANNEL). Accepts either
 *          `identifier` (email or phone), or the legacy `phone` field.
 * @access  Public
 */
router.post(
  '/resend-otp',
  [
    // Identifier validated in the handler (see verify-phone note above).
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
 * @desc    Reset password with token
 * @access  Public
 */
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required'),
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

/**
 * OAuth Routes
 * Social login (Google, Facebook, GitHub, Twitter)
 */
router.use('/', oauthRoutes);

module.exports = router;

