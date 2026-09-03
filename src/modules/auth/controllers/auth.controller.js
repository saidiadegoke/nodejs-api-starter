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
   *   1. Is the code valid and still claimable? → show "create account",
   *      with the full candidate preview (mirrors /auth/register-with-code)
   *      so the verify-info screen can render without a second round-trip.
   *   2. Has it already been used to create an account? → show "log in"
   *      (with the account's masked email/phone so the client can
   *      prefill the identifier field).
   *   3. Is it expired / unknown? → show error.
   *
   * Response shape (claimable):
   *   {
   *     valid: true,
   *     expires_at: ISO|null,
   *     university: { id, name, short_name },
   *     candidate: { registration_id, full_name, jupeb_reg_no, provisional_candidate_code, photo_url, status },
   *     basic_information: {
   *       date_of_birth, gender,
   *       residential_address,
   *       country: { id, name }|null,
   *       state_of_origin: { id, name, code }|null,
   *       lga: { id, name }|null,
   *       place_of_birth,
   *     },
   *     contact_information: { email, phone },
   *     next_of_kin: { name, contact_no, ... }|null,
   *     subject_combination: { id, code, title }|null,
   *     session: { id, academic_year, year_short }|null,
   *   }
   *
   * Response shape (not claimable): same as before — { valid:false, error_code, ... }.
   *
   * Public endpoint — no auth required. Account identifiers are masked so
   * the response can't be used for enumeration. Candidate preview is only
   * returned for claimable codes (post-claim, the masked-account block
   * carries everything the log-in UI needs).
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
      const GeoModel = require('../../../shared/models/geo.model');
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

      // Claimable — assemble the full candidate preview. previewByCode
      // already does the heavy lifting (NIN intake + display-object
      // resolution); we add the geo id resolution + jupeb_reg_no on top.
      const preview = await AuthService.previewByCode(code);
      const geo = await GeoModel.resolveBundle({
        country: 'Nigeria',
        stateOfOrigin: preview.basic_information && preview.basic_information.state_of_origin,
        lga: preview.basic_information && preview.basic_information.lga,
      });

      const regExtra = await pool.query(
        `SELECT jupeb_candidate_number FROM jupeb_registrations WHERE id = $1`,
        [row.id]
      );

      // Prefer the dedicated jupeb_next_of_kin row (student-captured /
      // institution-edited); fall back to whatever NIN returned.
      const NextOfKinModel = require('../../jupeb/models/next-of-kin.model');
      const nokRow = await NextOfKinModel.findActiveByRegistration(row.id);
      const nextOfKin = AuthController._normalizeNextOfKin(nokRow, preview.next_of_kin);

      return sendSuccess(res, {
        valid: true,
        expires_at: row.institution_code_expires_at,
        university,
        candidate: {
          ...preview.candidate,
          jupeb_reg_no:
            (regExtra.rows[0] && regExtra.rows[0].jupeb_candidate_number) ||
            preview.candidate.provisional_candidate_code ||
            null,
        },
        basic_information: {
          ...preview.basic_information,
          country: geo.country,
          state_of_origin: geo.state_of_origin,
          lga: geo.lga,
        },
        contact_information: preview.contact_information,
        next_of_kin: nextOfKin,
        subject_combination: preview.subject_combination,
        session: preview.session,
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
      const identifier = String(req.body.identifier || '').trim();
    const password = String(req.body.password || '').trim();
      
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
   * Resolve next-of-kin for the codeStatus preview. Prefers the
   * jupeb_next_of_kin row (student- or institution-captured); falls back
   * to whatever the NIN provider returned. Returns a normalized shape
   * regardless of source so the client renders one way.
   *
   * Output: { name, relationship, contact_no, phone, email, address, source } | null
   */
  static _normalizeNextOfKin(jupebRow, ninPayload) {
    if (jupebRow) {
      return {
        name: jupebRow.name || null,
        relationship: jupebRow.relationship || null,
        contact_no: jupebRow.phone || jupebRow.email || null,
        phone: jupebRow.phone || null,
        email: jupebRow.email || null,
        address: jupebRow.address || null,
        source: jupebRow.source || 'student',
      };
    }
    if (ninPayload && typeof ninPayload === 'object') {
      const phone = ninPayload.phone || ninPayload.contact || ninPayload.contact_no || null;
      return {
        name: ninPayload.name || ninPayload.full_name || null,
        relationship: ninPayload.relationship || null,
        contact_no: phone || ninPayload.email || null,
        phone,
        email: ninPayload.email || null,
        address: ninPayload.address || null,
        source: 'nin',
      };
    }
    return null;
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
  /**
   * Initiate a password reset.
   *
   * Body:
   *   identifier: email | phone (required)
   *   delivery?: 'token' | 'otp'        (default 'token' — existing email-link flow)
   *   channel?:  'email' | 'sms' | 'both'  (only used when delivery='otp';
   *              default: env OTP_CHANNEL, else email when present, else sms)
   *
   * Response (always shape-stable to avoid leaking account existence):
   *   { reset_initiated: true, delivery, channels[], expires_at, masked_recipient }
   *
   * Back-compat note: legacy callers that didn't pass `delivery` get the
   * existing email-link flow. The response also still includes a `method`
   * field (= delivery) for older clients.
   */
  static async forgotPassword(req, res) {
    try {
      const { identifier, delivery, channel } = req.body || {};
      if (!identifier) {
        return sendError(res, 'Email or phone is required', BAD_REQUEST);
      }
      const requestedDelivery = delivery === 'otp' ? 'otp' : 'token';
      const passwordReset = require('../services/password-reset.service');

      const user = await passwordReset.loadUserForReset(identifier);
      if (!user) {
        // Account-enumeration guard: same shape whether the user exists.
        const fakeChannels = requestedDelivery === 'otp'
          ? (channel ? [channel] : ['email'])
          : ['email'];
        const ttlMs = (Number(process.env.OTP_TTL_MINUTES) || 15) * 60 * 1000;
        return sendSuccess(
          res,
          {
            reset_initiated: true,
            delivery: requestedDelivery,
            method: requestedDelivery, // legacy alias
            channels: fakeChannels,
            expires_at: new Date(Date.now() + ttlMs).toISOString(),
            masked_recipient: AuthController._maskRecipient(identifier),
          },
          requestedDelivery === 'otp'
            ? 'If an account exists, a reset code has been sent'
            : 'If an account exists, a reset link has been sent',
          OK
        );
      }

      const issued = await passwordReset.issueReset({
        user,
        delivery: requestedDelivery,
        channel,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      return sendSuccess(
        res,
        {
          reset_initiated: true,
          delivery: issued.delivery,
          method: issued.delivery, // legacy alias
          channels: issued.channels,
          expires_at: issued.expires_at,
          masked_recipient: issued.masked_recipient,
          ...(issued.token ? { token: issued.token } : {}),
          ...(issued.code ? { code: issued.code } : {}),
        },
        issued.delivery === 'otp'
          ? 'Password reset code sent'
          : 'Password reset link sent',
        OK
      );
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code ? { error_code: error.error_code } : null;
      return sendError(res, error.message, status, details);
    }
  }

  /**
   * Reset password. Accepts either redemption shape:
   *
   *   Token (link) flow:  { token, new_password }
   *   OTP flow:           { identifier, code, new_password }
   *
   * Token flow is unchanged; OTP flow is the new mobile-friendly variant
   * powered by migration 015 + password-reset.service. Both produce the
   * same success email.
   */
  static async resetPassword(req, res) {
    try {
      const { token, code, identifier } = req.body || {};
      const new_password = req.body && req.body.new_password ? String(req.body.new_password).trim() : undefined;
      const passwordReset = require('../services/password-reset.service');
      const sendEmail = require('../../../shared/utils/sendEmail');

      if (!new_password) {
        return sendError(res, 'New password is required', BAD_REQUEST);
      }
      if (!token && !code) {
        return sendError(res, 'Either `token` or `code` (with identifier) is required', BAD_REQUEST);
      }

      let result;
      if (token) {
        result = await passwordReset.redeemToken(token, new_password);
      } else {
        result = await passwordReset.redeemOtp({ identifier, code, newPassword: new_password });
      }

      // Best-effort success email (token flow already had this; we
      // surface it for the OTP flow too so the user gets a confirmation).
      if (result.email) {
        const appName = process.env.APP_NAME || 'our app';
        const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        const loginUrl = `${frontendUrl}/auth/login`;
        const resetDate = new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        setImmediate(() => {
          sendEmail({
            to: result.email,
            subject: `Password Reset Successful - ${appName}`,
            templateFile: 'password-reset-success.html',
            placeholders: [
              result.first_name || 'User',
              resetDate,
              loginUrl,
              resetDate,
              result.email,
            ],
          }).catch((err) => {
            // eslint-disable-next-line no-console
            console.warn('[auth.resetPassword] success email failed:', err && err.message);
          });
        });
      }

      return sendSuccess(res, null, 'Password reset successfully', OK);
    } catch (error) {
      const status = error.status || BAD_REQUEST;
      const details = error.error_code ? { error_code: error.error_code } : null;
      return sendError(res, error.message, status, details);
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
  /**
   * Helper to thoroughly clean up all user and institution associations for an email.
   */
  static async _deepDeleteByEmail(email) {
    const pool = require('../../../db/pool');
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return { usersDeleted: 0, institutionsDeleted: 0 };

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Find all users matching email (case-insensitive)
      const userRes = await client.query(
        `SELECT id, phone FROM users WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );
      const userIds = userRes.rows.map((r) => r.id);
      const phoneNumbers = userRes.rows.map((r) => r.phone).filter(Boolean);

      // 2. Find all institutions matching email (case-insensitive)
      const uniRes = await client.query(
        `SELECT id FROM jupeb_universities WHERE LOWER(email) = $1`,
        [normalizedEmail]
      );
      const uniIds = uniRes.rows.map((r) => r.id);

      // 3. Collect all registration IDs tied to these users or institutions
      const regRes = await client.query(
        `SELECT id FROM jupeb_registrations 
          WHERE (user_id = ANY($1::uuid[]) OR university_id = ANY($2::uuid[]))`,
        [userIds.length ? userIds : [null], uniIds.length ? uniIds : [null]]
      );
      const regIds = regRes.rows.map((r) => r.id);

      if (regIds.length) {
        await client.query(`DELETE FROM jupeb_biometric_captures WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_registration_documents WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_registration_status_history WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_registration_results WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_registration_scores WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_result_entries WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM jupeb_next_of_kin WHERE registration_id = ANY($1::uuid[])`, [regIds]);
        await client.query(`DELETE FROM ocr_results WHERE job_id IN (SELECT id FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[]))`, [regIds.map(String)]);
        await client.query(`DELETE FROM ocr_jobs WHERE metadata->>'registration_id' = ANY($1::text[])`, [regIds.map(String)]);
        await client.query(`DELETE FROM jupeb_registrations WHERE id = ANY($1::uuid[])`, [regIds]);
      }

      // 4. Clean user-specific associations
      if (userIds.length) {
        await client.query(`DELETE FROM jupeb_registration_status_history WHERE changed_by = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM jupeb_nin_verifications WHERE requested_by = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM user_universities WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM user_roles WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM user_permissions WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM user_preferences WHERE user_id = ANY($1::uuid[])`, [userIds]).catch(() => {});
        await client.query(`DELETE FROM social_accounts WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM password_resets WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM verification_tokens WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM notifications WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM api_keys WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM webhooks WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM admin_audit_logs WHERE admin_user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM posts WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM profiles WHERE user_id = ANY($1::uuid[])`, [userIds]);
        await client.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [userIds]);
      }

      // Also clean any leftover user by email directly
      await client.query(`DELETE FROM users WHERE LOWER(email) = $1`, [normalizedEmail]);

      // Clean OTP codes by email or phone
      await client.query(
        `DELETE FROM otp_codes WHERE LOWER(email) = $1 OR phone = ANY($2::text[])`,
        [normalizedEmail, phoneNumbers]
      ).catch(() => {});

      // Clean NIN verifications with matching email inside JSON payload
      await client.query(
        `DELETE FROM jupeb_nin_verifications 
          WHERE LOWER(intake_payload->>'email') = $1 
             OR LOWER(response_payload->>'email') = $1`,
        [normalizedEmail]
      ).catch(() => {});

      // 5. Clean university-specific associations
      if (uniIds.length) {
        await client.query(
          `DELETE FROM jupeb_subject_combination_items 
            WHERE combination_id IN (SELECT id FROM jupeb_subject_combinations WHERE university_id = ANY($1::uuid[]))`,
          [uniIds]
        );
        await client.query(`DELETE FROM jupeb_subject_combinations WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await client.query(`DELETE FROM jupeb_document_requirements WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await client.query(`DELETE FROM jupeb_courses WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await client.query(`DELETE FROM user_universities WHERE university_id = ANY($1::uuid[])`, [uniIds]);
        await client.query(`UPDATE profiles SET jupeb_university_id = NULL WHERE jupeb_university_id = ANY($1::uuid[])`, [uniIds]);
        
        // Roles owned by this university
        const uniRoles = await client.query(
          `SELECT id FROM roles WHERE owner_jupeb_university_id = ANY($1::uuid[])`,
          [uniIds]
        );
        const uniRoleIds = uniRoles.rows.map((r) => r.id);
        if (uniRoleIds.length) {
          await client.query(`DELETE FROM user_roles WHERE role_id = ANY($1::uuid[])`, [uniRoleIds]);
          await client.query(`DELETE FROM role_permissions WHERE role_id = ANY($1::uuid[])`, [uniRoleIds]);
          await client.query(`DELETE FROM roles WHERE id = ANY($1::uuid[])`, [uniRoleIds]);
        }

        await client.query(`DELETE FROM jupeb_universities WHERE id = ANY($1::uuid[])`, [uniIds]);
      }

      // Also clean any leftover university by email directly
      await client.query(`DELETE FROM jupeb_universities WHERE LOWER(email) = $1`, [normalizedEmail]);

      await client.query('COMMIT');
      return {
        usersDeleted: userIds.length,
        institutionsDeleted: uniIds.length,
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * TEMPORARY open endpoint — delete a user and all associations by email.
   */
  static async deleteUser(req, res) {
    try {
      const { email } = req.body;
      if (!email) return sendError(res, 'email is required', BAD_REQUEST);

      const result = await AuthController._deepDeleteByEmail(email);
      sendSuccess(res, { email, ...result }, 'User and all associations deleted successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * TEMPORARY open endpoint — delete an institution and all associations by email.
   */
  static async deleteInstitution(req, res) {
    try {
      const { email } = req.body;
      const result = await AuthController._deepDeleteByEmail(email);
      sendSuccess(res, { email, ...result }, 'Institution and all associations deleted successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Resend welcome credentials email to an institution admin.
   */
  static async resendInstitutionCredentials(req, res) {
    try {
      const { email } = req.body;
      if (!email) return sendError(res, 'email is required', BAD_REQUEST);

      const { resendInstitutionAdminCredentials } = require('../../jupeb/services/institution-admin-provision.service');
      const data = await resendInstitutionAdminCredentials(email);
      sendSuccess(res, data, 'Welcome credentials email resent successfully', OK);
    } catch (error) {
      sendError(res, error.message, error.status || BAD_REQUEST);
    }
  }
}

module.exports = AuthController;
