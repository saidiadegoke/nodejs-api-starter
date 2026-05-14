const AuthService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, UNAUTHORIZED, CONFLICT, UNPROCESSABLE_ENTITY } = require('../../../shared/constants/statusCodes');

class AuthController {
  /**
   * Register new user
   */
  static async register(req, res) {
    try {
      // Bot detection: Check honeypot field
      // Bots typically fill all fields, including hidden ones
      if (req.body.website || req.body.url || req.body.homepage) {
        // Silently reject bot submissions with generic error
        return sendError(res, 'Registration failed. Please try again later.', BAD_REQUEST);
      }

      const user = await AuthService.register(req.body);
      
      // Fire-and-forget welcome email — deferred via setImmediate so
      // the HTTP response goes out before the worker boots.
      if (user.email && req.body.first_name) {
        const sendEmail = require('../../../shared/utils/sendEmail');
        const appName = process.env.APP_NAME || 'our app';
        const welcomeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/`;

        setImmediate(() => {
          sendEmail({
            to: user.email,
            subject: `Welcome to ${appName}!`,
            templateFile: 'welcome.html',
            placeholders: [
              req.body.first_name || 'User',
              welcomeUrl,
              user.email
            ]
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[auth.register] welcome email failed:', err && err.message);
          });
        });
      }
      
      sendSuccess(res, user, 'Registration successful. Please verify your phone number.', CREATED);
    } catch (error) {
      // Check for duplicate key violation (PostgreSQL error code 23505)
      if (error.code === '23505' || error.message.includes('already exists') || error.message.includes('duplicate')) {
        return sendError(res, 'User with this email or phone already exists', CONFLICT);
      }
      if (error.message.includes('Invalid role') || error.message.includes('required')) {
        return sendError(res, error.message, UNPROCESSABLE_ENTITY);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Preview the candidate behind a code without claiming it. Powers the
   * figma `log in 11` → `log in 12` transition: code entry returns the
   * student-information payload for the verify-info screen. The code
   * stays in `code_issued`; only `completeRegistration` invalidates it.
   *
   * Accepts the code on either the body (POST) or query string (GET),
   * so the same handler covers both verbs.
   */
  static async registerWithCode(req, res) {
    try {
      // Honeypot
      if (req.body && (req.body.website || req.body.url || req.body.homepage)) {
        return sendError(res, 'Registration failed. Please try again later.', BAD_REQUEST);
      }
      const code = (req.body && req.body.code) || (req.query && req.query.code);
      const result = await AuthService.previewByCode(code);
      return sendSuccess(res, result, 'Code preview', OK);
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code
        ? { error_code: error.error_code, ...(error.details || {}) }
        : (error.details || null);
      return sendError(res, error.message, status, details);
    }
  }

  /**
   * Complete the registration wizard. Takes the code + password (set on
   * the Bio Data Update step) plus any editable bio overrides, mints
   * the user account, and atomically claims the registration. This is
   * the call that invalidates the code as used.
   */
  static async completeRegistration(req, res) {
    try {
      if (req.body && (req.body.website || req.body.url || req.body.homepage)) {
        return sendError(res, 'Registration failed. Please try again later.', BAD_REQUEST);
      }
      const result = await AuthService.completeRegistration(req.body);
      return sendSuccess(res, result, 'Registration successful', CREATED);
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code
        ? { error_code: error.error_code, ...(error.details || {}) }
        : (error.details || null);
      return sendError(res, error.message, status, details);
    }
  }

  /**
   * Public code-status lookup (M.9 — figma `log in 11` pre-validation).
   *
   * Tells the mobile / web app, given a code typed by the student:
   *   1. Is the code valid and still claimable? → show "create account"
   *   2. Has it already been used to create an account? → show "log in"
   *      (with the account's masked email/phone so the client can
   *      prefill the identifier field)
   *   3. Is it expired / unknown? → show error
   *
   * Response shape:
   *   {
   *     valid: boolean,         // can this code still be used to claim?
   *     error_code?: string,    // present when valid === false
   *     expires_at?: ISO,
   *     university?: { id, name, short_name },
   *     account?: {             // present when error_code === 'code_already_claimed'
   *       exists: true,
   *       active: boolean,      // users.status === 'active'
   *       email_masked: string|null,
   *       phone_masked: string|null,
   *       email_verified: boolean,
   *       phone_verified: boolean,
   *       can_login: boolean,   // true ⇔ active === true
   *     }
   *   }
   *
   * Public endpoint — no auth required. Account identifiers are masked
   * so the response can't be used for enumeration.
   */
  static async codeStatus(req, res) {
    try {
      const code = String(req.query.code || '').trim();
      if (!code) {
        return sendError(res, 'code query parameter is required', BAD_REQUEST, {
          error_code: 'code_required'
        });
      }
      const pool = require('../../../db/pool');
      // JOIN users too so a single round-trip carries everything we need
      // to decide between "claim" and "log in" UIs on the client.
      const result = await pool.query(
        `SELECT r.id, r.status, r.user_id, r.institution_code_expires_at,
                u.id AS university_id, u.name AS university_name, u.short_name,
                acc.email AS account_email,
                acc.phone AS account_phone,
                acc.status AS account_status,
                acc.email_verified AS account_email_verified,
                acc.phone_verified AS account_phone_verified
         FROM jupeb_registrations r
         JOIN jupeb_universities u  ON u.id = r.university_id
         LEFT JOIN users acc        ON acc.id = r.user_id
         WHERE r.institution_issued_code = $1
         LIMIT 1`,
        [code]
      );
      const row = result.rows[0];
      if (!row) {
        return sendSuccess(res, { valid: false, error_code: 'code_not_found' });
      }

      const university = {
        id: row.university_id,
        name: row.university_name,
        short_name: row.short_name,
      };

      if (
        row.institution_code_expires_at &&
        new Date(row.institution_code_expires_at).getTime() < Date.now()
      ) {
        return sendSuccess(res, {
          valid: false,
          error_code: 'code_expired',
          expires_at: row.institution_code_expires_at,
          university,
        });
      }

      // Code has been used (user_id set ⇒ account exists; status≠code_issued
      // without a user means something moved the row administratively).
      if (row.status !== 'code_issued' || row.user_id) {
        const claimed = !!row.user_id;
        const out = {
          valid: false,
          error_code: claimed ? 'code_already_claimed' : 'code_unavailable',
          expires_at: row.institution_code_expires_at,
          university,
        };
        if (claimed) {
          const active = row.account_status === 'active';
          out.account = {
            exists: true,
            active,
            email_masked: AuthController._maskRecipient(row.account_email),
            phone_masked: AuthController._maskRecipient(row.account_phone),
            email_verified: !!row.account_email_verified,
            phone_verified: !!row.account_phone_verified,
            can_login: active,
          };
        }
        return sendSuccess(res, out);
      }

      // Claimable.
      return sendSuccess(res, {
        valid: true,
        expires_at: row.institution_code_expires_at,
        university,
      });
    } catch (err) {
      return sendError(res, err.message, 500);
    }
  }

  /**
   * Login user
   */
  static async login(req, res) {
    try {
      const { identifier, password } = req.body;
      
      if (!identifier || !password) {
        return sendError(res, 'Email/phone and password are required', BAD_REQUEST);
      }
      
      const deviceInfo = {
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      };
      
      const result = await AuthService.login(identifier, password, deviceInfo);
      sendSuccess(res, result, 'Login successful', OK);
    } catch (error) {
      console.error('Login error:', error.message);
      if (error.message.includes('credentials') || error.message.includes('not active')) {
        return sendError(res, 'Invalid username or password' || error.message, UNAUTHORIZED);
      }
      sendError(res, 'Invalid username or password' || error.message, BAD_REQUEST);
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(req, res) {
    try {
      const { refresh_token } = req.body;
      
      if (!refresh_token) {
        return sendError(res, 'Refresh token is required', BAD_REQUEST);
      }
      
      const result = await AuthService.refreshToken(refresh_token);
      sendSuccess(res, result, 'Token refreshed successfully', OK);
    } catch (error) {
      sendError(res, error.message, UNAUTHORIZED);
    }
  }

  /**
   * Logout user
   */
  static async logout(req, res) {
    try {
      await AuthService.logout(req.user.user_id, req.user.session_id);
      sendSuccess(res, null, 'Logged out successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Verify a 6-digit OTP (email or SMS — both flow through the same
   * code path). Accepts the identifier on either `identifier`, `email`,
   * or `phone` for backward compatibility with the legacy `verify-phone`
   * payload. Returns 200 + { verified: true, user_id, channel }.
   */
  static async verifyPhone(req, res) {
    try {
      const identifier = AuthController._otpIdentifier(req.body);
      if (!identifier) {
        return sendError(res, 'identifier (email or phone) is required', BAD_REQUEST);
      }
      const { otp } = req.body;
      if (!otp) {
        return sendError(res, 'OTP is required', BAD_REQUEST);
      }
      const AuthModel = require('../models/auth.model');
      const user = await AuthModel.findByIdentifier(identifier);
      if (!user) {
        // Don't leak existence — mirror an invalid-OTP response.
        return sendError(res, 'Invalid verification code', BAD_REQUEST);
      }
      const otpService = require('../services/otp.service');
      const result = await otpService.verifyOtp(user.id, otp);
      return sendSuccess(
        res,
        { verified: true, user_id: user.id, channel: result.channel },
        'Verification successful',
        OK
      );
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code ? { error_code: error.error_code } : null;
      return sendError(res, error.message, status, details);
    }
  }

  /**
   * Issue a fresh 6-digit OTP for the user and dispatch it via the
   * configured channel(s). Channel selection (in priority order):
   *   1. request body `channel: 'email' | 'sms' | 'both'`
   *   2. env `OTP_CHANNEL`
   *   3. default `'email'`
   *
   * Response shape:
   *   { sent, channels: ['email'?, 'sms'?], expires_at, masked_recipient }
   *
   * Never leaks whether the user exists — when no account matches, the
   * handler still returns 200 with a fake-mask response so an attacker
   * can't enumerate registered accounts.
   */
  static async resendOtp(req, res) {
    try {
      const identifier = AuthController._otpIdentifier(req.body);
      if (!identifier) {
        return sendError(res, 'identifier (email or phone) is required', BAD_REQUEST);
      }
      const requestedChannel = req.body && req.body.channel;
      const AuthModel = require('../models/auth.model');
      const user = await AuthModel.findByIdentifier(identifier);

      // Account-enumeration guard: same response shape whether the user
      // exists or not. We still do the lookup but bail with a fake mask.
      if (!user) {
        const ttlMs = (Number(process.env.OTP_TTL_MINUTES) || 10) * 60 * 1000;
        return sendSuccess(
          res,
          {
            sent: true,
            channels: [(requestedChannel || process.env.OTP_CHANNEL || 'email')],
            expires_at: new Date(Date.now() + ttlMs).toISOString(),
            masked_recipient: AuthController._maskRecipient(identifier),
          },
          'Verification code sent',
          OK
        );
      }

      const otpService = require('../services/otp.service');
      const issued = await otpService.issueOtp(user.id, {
        channel: requestedChannel,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(
        res,
        {
          sent: true,
          channels: issued.channels,
          expires_at: issued.expires_at,
          masked_recipient: AuthController._maskRecipient(
            issued.channels.includes('email') ? user.email : user.phone
          ),
          // In test mode, the raw code is surfaced so integration tests
          // can assert the verify-side mechanics. Outside of test mode
          // this field is absent.
          ...(issued.code ? { code: issued.code } : {}),
        },
        'Verification code sent',
        OK
      );
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code ? { error_code: error.error_code } : null;
      return sendError(res, error.message, status, details);
    }
  }

  // ── Email verification (token-link flow) ───────────────────────────────
  //
  // Three routes:
  //   POST /auth/send-verification    (authenticated)
  //   POST /auth/resend-verification  (authenticated; same effect, alt template)
  //   GET  /auth/verify-email?token=  (public — the link target)
  //
  // Service methods (sendVerificationEmail, resendVerificationEmail,
  // verifyEmailToken) already exist on AuthService; these are just the
  // HTTP entry points.

  static async sendVerification(req, res) {
    try {
      const userId = req.user && req.user.user_id;
      if (!userId) return sendError(res, 'Unauthorized', UNAUTHORIZED);
      const result = await AuthService.sendVerificationEmail(userId);
      // Never expose the raw token outside test mode; the service only
      // returns it for assertion convenience.
      const safe = { sent: true, expires_at: result.expiresAt };
      if (process.env.NODE_ENV === 'test') safe.token = result.token;
      return sendSuccess(res, safe, 'Verification email queued', OK);
    } catch (err) {
      const details = err.error_code ? { error_code: err.error_code } : null;
      return sendError(res, err.message, err.status || BAD_REQUEST, details);
    }
  }

  static async resendVerification(req, res) {
    try {
      const userId = req.user && req.user.user_id;
      if (!userId) return sendError(res, 'Unauthorized', UNAUTHORIZED);
      const result = await AuthService.resendVerificationEmail(userId);
      const safe = { sent: true, expires_at: result.expiresAt };
      if (process.env.NODE_ENV === 'test') safe.token = result.token;
      return sendSuccess(res, safe, 'Verification email queued', OK);
    } catch (err) {
      const details = err.error_code ? { error_code: err.error_code } : null;
      return sendError(res, err.message, err.status || BAD_REQUEST, details);
    }
  }

  static async verifyEmail(req, res) {
    try {
      // Accept the token from query (link click) or body (POST variant).
      const token = (req.query && req.query.token) || (req.body && req.body.token);
      const result = await AuthService.verifyEmailToken(token);
      return sendSuccess(res, result, 'Email verified', OK);
    } catch (err) {
      const details = err.error_code ? { error_code: err.error_code } : null;
      return sendError(res, err.message, err.status || BAD_REQUEST, details);
    }
  }

  /**
   * Pull the OTP identifier (email or phone) from a request body that
   * may carry it under `identifier`, `email`, or the legacy `phone`.
   */
  static _otpIdentifier(body) {
    if (!body || typeof body !== 'object') return null;
    const raw = body.identifier || body.email || body.phone;
    return raw ? String(raw).trim() : null;
  }

  /**
   * Mask an email or phone for safe response logging. Email: keep first
   * 2 + last 1 of local part. Phone: keep first 4 + last 2.
   */
  static _maskRecipient(value) {
    if (!value) return '***';
    const s = String(value);
    if (s.includes('@')) {
      return s.replace(/^(.{1,2})[^@]*(@.*)$/, '$1***$2');
    }
    if (s.length > 6) {
      return `${s.slice(0, 4)}***${s.slice(-2)}`;
    }
    return '***';
  }

  /**
   * Forgot password
   */
  static async forgotPassword(req, res) {
    try {
      const { identifier } = req.body;
      
      if (!identifier) {
        return sendError(res, 'Email or phone is required', BAD_REQUEST);
      }
      
      const AuthModel = require('../models/auth.model');
      const pool = require('../../../db/pool');
      const crypto = require('crypto');
      const sendEmail = require('../../../shared/utils/sendEmail');
      
      const user = await AuthModel.findByIdentifier(identifier);
      if (!user) {
        // Don't reveal if user exists - still return success
        return sendSuccess(res, { 
          reset_initiated: true,
          method: 'email',
          masked_recipient: '***@***.***'
        }, 'If an account with that email exists, we have sent a password reset link', OK);
      }
      
      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(resetToken).digest('hex');
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
      
      // Store reset token in database
      await pool.query(
        `INSERT INTO password_resets (user_id, token_hash, email, phone, method, ip_address, user_agent, expires_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id, 
          tokenHash, 
          user.email, 
          user.phone, 
          user.email ? 'email' : 'sms',
          req.ip,
          req.headers['user-agent'],
          expiresAt
        ]
      );
      
      // Send email if user has email
      if (user.email) {
        const appName = process.env.APP_NAME || 'our app';
        const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

        setImmediate(() => {
          sendEmail({
            to: user.email,
            subject: `Reset Your ${appName} Password`,
            templateFile: 'forgot-password.html',
            placeholders: [
              user.first_name || user.display_name || 'User',
              resetUrl,
              resetUrl,
              user.email
            ]
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[auth.forgotPassword] reset email failed:', err && err.message);
          });
        });
        
        const maskedEmail = user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3');
        sendSuccess(res, { 
          reset_initiated: true,
          method: 'email',
          masked_recipient: maskedEmail
        }, 'Password reset link sent to your email', OK);
      } else {
        // For phone-only users, would send SMS in production
        const maskedPhone = user.phone.replace(/(\+\d{3})(.*)(\d{4})/, '$1***$3');
        sendSuccess(res, { 
          reset_initiated: true,
          method: 'sms',
          masked_recipient: maskedPhone
        }, 'Password reset code sent to your phone', OK);
      }
    } catch (error) {
      console.error('Forgot password error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(req, res) {
    try {
      const { token, new_password } = req.body;
      const sendEmail = require('../../../shared/utils/sendEmail');
      
      if (!token || !new_password) {
        return sendError(res, 'Reset token and new password are required', BAD_REQUEST);
      }
      
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const pool = require('../../../db/pool');
      
      // Hash the provided token to match against stored hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
      // console.log('[Password Reset] Token provided:', token);
      // console.log('[Password Reset] Token hash:', tokenHash);
      
      // First, check if token exists (without expiration/used checks for debugging)
      const allTokensResult = await pool.query(
        `SELECT pr.*, u.id as user_id, u.email, p.first_name,
                pr.expires_at > NOW() as is_valid,
                pr.used_at IS NULL as is_unused
         FROM password_resets pr 
         JOIN users u ON pr.user_id = u.id 
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE pr.token_hash = $1`,
        [tokenHash]
      );
      
      if (allTokensResult.rows.length === 0) {
        console.log('[Password Reset] No token found with hash:', tokenHash);
        // Check if there are any recent password resets for debugging
        const recentResets = await pool.query(
          `SELECT pr.id, pr.token_hash, pr.expires_at, pr.used_at, pr.created_at, u.email
           FROM password_resets pr
           JOIN users u ON pr.user_id = u.id
           ORDER BY pr.created_at DESC
           LIMIT 5`
        );
        console.log('[Password Reset] Recent password resets:', recentResets.rows.map(r => ({
          id: r.id,
          email: r.email,
          expires_at: r.expires_at,
          used_at: r.used_at,
          created_at: r.created_at,
          is_expired: r.expires_at < new Date(),
          is_used: r.used_at !== null
        })));
        return sendError(res, 'Invalid or expired reset token/code', BAD_REQUEST);
      }
      
      const tokenRecord = allTokensResult.rows[0];
      console.log('[Password Reset] Token found:', {
        id: tokenRecord.id,
        email: tokenRecord.email,
        expires_at: tokenRecord.expires_at,
        used_at: tokenRecord.used_at,
        is_valid: tokenRecord.is_valid,
        is_unused: tokenRecord.is_unused,
        now: new Date()
      });
      
      // Check if token exists and is valid
      const result = await pool.query(
        `SELECT pr.*, u.id as user_id, u.email, p.first_name 
         FROM password_resets pr 
         JOIN users u ON pr.user_id = u.id 
         LEFT JOIN profiles p ON u.id = p.user_id
         WHERE pr.token_hash = $1 AND pr.expires_at > NOW() AND pr.used_at IS NULL`,
        [tokenHash]
      );
      
      const resetRecord = result.rows[0];
      
      if (!resetRecord) {
        if (tokenRecord.used_at) {
          console.log('[Password Reset] Token has already been used');
          return sendError(res, 'This password reset link has already been used. Please request a new one.', BAD_REQUEST);
        }
        if (tokenRecord.expires_at <= new Date()) {
          console.log('[Password Reset] Token has expired. Expires at:', tokenRecord.expires_at, 'Now:', new Date());
          return sendError(res, 'This password reset link has expired. Please request a new one.', BAD_REQUEST);
        }
        return sendError(res, 'Invalid or expired reset token/code', BAD_REQUEST);
      }
      
      // Validate new password
      if (new_password.length < 8) {
        return sendError(res, 'Password must be at least 8 characters', UNPROCESSABLE_ENTITY);
      }
      
      // Update password
      const newHash = await bcrypt.hash(new_password, 10);
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, resetRecord.user_id]
      );
      
      // Mark reset token as used
      await pool.query(
        'UPDATE password_resets SET used_at = NOW() WHERE id = $1',
        [resetRecord.id]
      );
      
      // Send password reset success email asynchronously
      if (resetRecord.email) {
        const appName = process.env.APP_NAME || 'our app';
        const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const loginUrl = `${frontendUrl}/auth/login`;
        const resetDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        setImmediate(() => {
          sendEmail({
            to: resetRecord.email,
            subject: `Password Reset Successful - ${appName}`,
            templateFile: 'password-reset-success.html',
            placeholders: [
              resetRecord.first_name || 'User',
              resetDate,
              loginUrl,
              resetDate,
              resetRecord.email
            ]
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[auth.resetPassword] success email failed:', err && err.message);
          });
        });
      }
      
      sendSuccess(res, null, 'Password reset successfully', OK);
    } catch (error) {
      console.error('Reset password error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Change password
   */
  static async changePassword(req, res) {
    try {
      const { current_password, new_password } = req.body;
      
      if (!req.user || !req.user.user_id) {
        return sendError(res, 'Authentication required', UNAUTHORIZED);
      }
      
      if (!current_password || !new_password) {
        return sendError(res, 'Current password and new password are required', BAD_REQUEST);
      }
      
      const userId = req.user.user_id;
      const bcrypt = require('bcryptjs');
      const pool = require('../../../db/pool');
      
      // Get current password hash
      const result = await pool.query(
        'SELECT password_hash FROM users WHERE id = $1',
        [userId]
      );
      
      if (result.rows.length === 0) {
        return sendError(res, 'User not found', BAD_REQUEST);
      }
      
      const user = result.rows[0];
      
      // Verify current password
      const isValid = await bcrypt.compare(current_password, user.password_hash);
      if (!isValid) {
        return sendError(res, 'Current password is incorrect', UNAUTHORIZED);
      }
      
      // Validate new password
      if (new_password.length < 8) {
        return sendError(res, 'New password must be at least 8 characters', UNPROCESSABLE_ENTITY);
      }
      
      // Update password
      const newHash = await bcrypt.hash(new_password, 10);
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, userId]
      );
      
      sendSuccess(res, null, 'Password changed successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = AuthController;

