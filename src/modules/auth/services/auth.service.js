const AuthModel = require('../models/auth.model');
const CountryModel = require('../../../shared/models/country.model');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { jwtSecret, jwtExpiresIn } = require('../../../config/env.config');

class AuthService {
  /**
   * Format phone number with country code
   */
  static async formatPhoneNumber(phone, country_id) {
    if (!phone) return null;
    
    // If phone already has + prefix, return as is
    if (phone.startsWith('+')) {
      return phone;
    }
    
    // Get country phone code
    let phoneCode = '+234'; // Default to Nigeria
    
    if (country_id) {
      const country = await CountryModel.getById(country_id);
      if (country && country.phone_code) {
        phoneCode = country.phone_code;
      }
    }
    
    // Remove leading zeros from phone number
    const cleanPhone = phone.replace(/^0+/, '');
    
    return `${phoneCode}${cleanPhone}`;
  }

  /**
   * Register new user
   */
  static async register(userData) {
    // Validate required fields
    const { email, phone, password, first_name, last_name, role, country_id, referral_code } = userData;

    if (!email && !phone) {
      throw new Error('Either email or phone is required');
    }

    if (!password || password.length < 8) {
      throw new Error('Password must be at least 8 characters');
    }

    // Role is required; user creation flow must provide it
    const validRoles = [
      'super_admin',
      'admin',
      'agent',
      'user',
      'registrar',
      'program_director',
      'institution_admin',
    ];
    if (!role || !validRoles.includes(role)) {
      throw new Error(
        'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)'
      );
    }

    // Format phone number with country code
    const formattedPhone = await this.formatPhoneNumber(phone, country_id);

    // Check if user already exists
    if (email || formattedPhone) {
      const existing = await AuthModel.findByIdentifier(email || formattedPhone);
      if (existing) {
        throw new Error('User with this email or phone already exists');
      }
    }

    // Create user with formatted phone
    const user = await AuthModel.createUser({
      ...userData,
      phone: formattedPhone
    });

    // Get user roles
    const roles = await AuthModel.getUserRoles(user.id);
    const roleNames = roles.map(r => r.name);

    // Generate tokens for automatic login after signup
    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);

    // Create session
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    await AuthModel.createSession(user.id, refreshTokenHash, {
      source: 'registration',
      user_agent: 'web'
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        user_id: user.id,
        email: user.email,
        phone: user.phone,
        first_name,
        last_name,
        role: roleNames[0] || role || null,
        roles: roleNames,
        profile_photo: null,
        rating: null,
        verified: false,
        verification_required: true,
        created_at: user.created_at
      }
    };
  }

  /**
   * Register a new student using an institution-issued registration code.
   *
   * Single-shot signup for figma `log in 11`. Creates the user, assigns the
   * `student` role, claims the registration code, and links the registration
   * to the new user — all in a single DB transaction.
   *
   * Body: { code, password, first_name?, last_name?, email?, phone? }
   *  - email/phone default to whatever was carried on the registration's NIN
   *    intake when not provided.
   */
  static async registerWithCode(body) {
    const pool = require('../../../db/pool');
    const bcryptLib = require('bcryptjs');
    const jwtSign = jwt;

    if (!body || typeof body !== 'object') {
      const err = new Error('Body is required');
      err.status = 422;
      throw err;
    }
    const code = body.code ? String(body.code).trim() : '';
    const password = body.password ? String(body.password) : '';
    if (!code) {
      const err = new Error('code is required');
      err.status = 422;
      err.error_code = 'code_required';
      throw err;
    }
    if (!password || password.length < 8) {
      const err = new Error('Password must be at least 8 characters');
      err.status = 422;
      err.error_code = 'weak_password';
      throw err;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Lock the registration row by code so two concurrent claims can't race.
      const lock = await client.query(
        `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1 FOR UPDATE`,
        [code]
      );
      const reg = lock.rows[0];
      if (!reg) {
        await client.query('ROLLBACK');
        const err = new Error('Registration code not found');
        err.status = 404;
        err.error_code = 'code_not_found';
        throw err;
      }
      if (
        reg.institution_code_expires_at &&
        new Date(reg.institution_code_expires_at).getTime() < Date.now()
      ) {
        await client.query('ROLLBACK');
        const err = new Error('This institution code has expired');
        err.status = 410;
        err.error_code = 'code_expired';
        err.details = { expires_at: reg.institution_code_expires_at };
        throw err;
      }
      if (reg.status !== 'code_issued' || reg.user_id) {
        await client.query('ROLLBACK');
        const err = new Error('This code is no longer available');
        err.status = 409;
        err.error_code = reg.user_id ? 'code_already_claimed' : 'code_unavailable';
        throw err;
      }

      // 2. Resolve email/phone/name. Prefer body, fall back to NIN intake/payload.
      let intakePayload = {};
      let ninResponse = {};
      if (reg.nin_verification_id) {
        const ninRes = await client.query(
          `SELECT response_payload, intake_payload FROM jupeb_nin_verifications WHERE id = $1`,
          [reg.nin_verification_id]
        );
        if (ninRes.rows[0]) {
          intakePayload = ninRes.rows[0].intake_payload || {};
          ninResponse = ninRes.rows[0].response_payload || {};
        }
      }

      const email = (body.email && String(body.email).trim().toLowerCase())
        || (intakePayload.email && String(intakePayload.email).trim().toLowerCase())
        || null;
      const phone = (body.phone && String(body.phone).trim())
        || (intakePayload.phone && String(intakePayload.phone).trim())
        || (ninResponse.phone && String(ninResponse.phone).trim())
        || null;

      if (!email && !phone) {
        await client.query('ROLLBACK');
        const err = new Error('email or phone is required');
        err.status = 422;
        err.error_code = 'identifier_required';
        throw err;
      }

      const fullName = (intakePayload.name && String(intakePayload.name).trim())
        || [ninResponse.first_name, ninResponse.last_name].filter(Boolean).join(' ').trim()
        || null;
      const [first_name, ...rest] = (body.first_name
        ? [String(body.first_name).trim(), String(body.last_name || '').trim()]
        : (fullName ? fullName.split(/\s+/) : ['Candidate', '']));
      const last_name = body.last_name ? String(body.last_name).trim() : rest.join(' ').trim() || '';

      // 3. Reject duplicate identifier early.
      if (email) {
        const dup = await client.query(
          `SELECT id FROM users WHERE email = $1 AND deleted_at IS NULL LIMIT 1`,
          [email]
        );
        if (dup.rows.length) {
          await client.query('ROLLBACK');
          const err = new Error('Email already in use');
          err.status = 409;
          err.error_code = 'email_in_use';
          throw err;
        }
      }
      if (phone) {
        const dup = await client.query(
          `SELECT id FROM users WHERE phone = $1 AND deleted_at IS NULL LIMIT 1`,
          [phone]
        );
        if (dup.rows.length) {
          await client.query('ROLLBACK');
          const err = new Error('Phone already in use');
          err.status = 409;
          err.error_code = 'phone_in_use';
          throw err;
        }
      }

      // 4. Create the user, profile, and assign the student role.
      const passwordHash = await bcryptLib.hash(password, 10);
      const userInsert = await client.query(
        `INSERT INTO users (email, phone, password_hash, status)
         VALUES ($1, $2, $3, 'active')
         RETURNING id, email, phone, status, created_at`,
        [email, phone, passwordHash]
      );
      const user = userInsert.rows[0];

      const displayName = [first_name, last_name].filter(Boolean).join(' ').trim() || null;
      await client.query(
        `INSERT INTO profiles (user_id, first_name, last_name, display_name)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id, first_name || null, last_name || null, displayName]
      );

      // Prefer 'student' role; fall back to 'user' if 'student' isn't seeded.
      const roleResult = await client.query(
        `INSERT INTO user_roles (user_id, role_id)
         SELECT $1, id FROM roles WHERE name = ANY($2::varchar[])
         ORDER BY array_position($2::varchar[], name)
         LIMIT 1
         ON CONFLICT (user_id, role_id) DO NOTHING
         RETURNING role_id`,
        [user.id, ['student', 'user']]
      );
      if (!roleResult.rows.length) {
        // Neither role exists yet — fall back to inserting any base role
        await client.query(
          `INSERT INTO user_roles (user_id, role_id)
           SELECT $1, id FROM roles WHERE name = 'user'
           ON CONFLICT (user_id, role_id) DO NOTHING`,
          [user.id]
        );
      }

      // 5. Atomically claim the registration.
      const upd = await client.query(
        `UPDATE jupeb_registrations
            SET user_id = $2,
                claimed_at = CURRENT_TIMESTAMP,
                status = 'claimed',
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND status = 'code_issued' AND user_id IS NULL
         RETURNING *`,
        [reg.id, user.id]
      );
      if (!upd.rows[0]) {
        await client.query('ROLLBACK');
        const err = new Error('This code is no longer available');
        err.status = 409;
        err.error_code = 'code_already_claimed';
        throw err;
      }
      await client.query(
        `INSERT INTO jupeb_registration_status_history (registration_id, from_status, to_status, reason, changed_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [reg.id, 'code_issued', 'claimed', 'register-with-code', user.id]
      );

      await client.query('COMMIT');

      // 6. Issue tokens (outside the txn — no DB writes other than the session).
      const rolesRes = await pool.query(
        `SELECT r.name FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1`,
        [user.id]
      );
      const roleNames = rolesRes.rows.map((r) => r.name);
      const accessToken = AuthService.generateAccessToken(user.id, roleNames);
      const refreshToken = AuthService.generateRefreshToken(user.id);
      const refreshHash = await bcryptLib.hash(refreshToken, 10);
      await AuthModel.createSession(user.id, refreshHash, {
        source: 'register-with-code',
        user_agent: 'web'
      });

      const claimedReg = upd.rows[0];

      // Fire-and-forget welcome email. Send only when we have an email
      // address; never block the registration on email delivery. Wrapped
      // in setImmediate so the unawaited promise's DB queries don't
      // share the response's microtask tail.
      if (user.email) {
        setImmediate(() => {
          try {
            // eslint-disable-next-line global-require
            const jupebMailer = require('../../jupeb/services/jupeb-mailer.service');
            // The mailer's loadRecipient does its own university lookup;
            // pass only what we already have so this stays one query.
            jupebMailer.sendWelcomeStudent({
              email: user.email,
              firstName: first_name,
              provisionalCode: claimedReg.provisional_candidate_code,
            });
          } catch (_) { /* non-fatal */ }
        });
      }

      return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer',
        expires_in: 3600,
        user: {
          user_id: user.id,
          email: user.email,
          phone: user.phone,
          first_name,
          last_name,
          role: roleNames[0] || 'student',
          roles: roleNames
        },
        registration: {
          id: claimedReg.id,
          status: claimedReg.status,
          provisional_candidate_code: claimedReg.provisional_candidate_code,
          claimed_at: claimedReg.claimed_at
        }
      };
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch { /* ignore */ }
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Login user
   */
  static async login(identifier, password, deviceInfo = {}) {
    // Find user
    const user = await AuthModel.findByIdentifier(identifier);
    
    if (!user) {
      throw new Error('Invalid credentials');
    }
    
    // Check if password_hash exists
    if (!user.password_hash) {
      throw new Error('Invalid credentials');
    }
    
    // Verify password
    const isValidPassword = await AuthModel.verifyPassword(password, user.password_hash);
    
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }
    
    // Check if user is active
    if (user.status !== 'active') {
      throw new Error('Account is not active');
    }
    
    // Get user roles
    const roles = await AuthModel.getUserRoles(user.id);
    const roleNames = roles.map(r => r.name);
    
    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, roleNames);
    const refreshToken = this.generateRefreshToken(user.id);
    
    // Create session
    const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
    const session = await AuthModel.createSession(user.id, refreshTokenHash, deviceInfo);
    
    // Update last login
    const pool = require('../../../db/pool');
    await pool.query(
      'UPDATE users SET last_login_at = NOW() WHERE id = $1',
      [user.id]
    );
    
    // Embed the latest JUPEB registration so mobile clients can route
    // immediately on app boot without a follow-up /me/current call.
    // Best-effort: silent if the jupeb tables aren't migrated.
    let registration = null;
    try {
      const regRes = await pool.query(
        `SELECT id, status, provisional_candidate_code, jupeb_candidate_number,
                claimed_at, submitted_at, approved_at, dashboard_unlocked_at
           FROM jupeb_registrations
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 1`,
        [user.id]
      );
      if (regRes.rows[0]) {
        const r = regRes.rows[0];
        registration = {
          id: r.id,
          status: r.status,
          provisional_candidate_code: r.provisional_candidate_code,
          jupeb_candidate_number: r.jupeb_candidate_number,
          claimed_at: r.claimed_at,
          submitted_at: r.submitted_at,
          approved_at: r.approved_at,
          dashboard_unlocked: Boolean(r.dashboard_unlocked_at),
          next_step: AuthService._nextStepForRegistration(r.status),
        };
      }
    } catch { /* jupeb tables absent — non-fatal */ }

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: 3600,
      user: {
        user_id: user.id,
        first_name: user.first_name,
        last_name: user.last_name,
        phone: user.phone,
        email: user.email,
        role: roleNames[0] || null,
        roles: roleNames,
        profile_photo: user.profile_photo_url || null,
        rating: null,
        verified: user.email_verified && user.phone_verified,
        created_at: user.created_at
      },
      registration,
    };
  }

  /**
   * Maps a registration status to the next action the mobile / web app
   * should send the user to. Kept in sync with registration-state.service.
   */
  static _nextStepForRegistration(status) {
    switch (status) {
      case 'code_issued':                 return 'claim_code';
      case 'claimed':                     return 'confirm_subjects';
      case 'pending_student_confirm':     return 'confirm_subjects';
      case 'pending_documents':           return 'upload_documents';
      case 'pending_institution_review':  return 'await_review';
      case 'approved':                    return 'view_dashboard';
      case 'rejected':                    return 'view_rejection';
      case 'withdrawn':                   return 'restart';
      default:                            return null;
    }
  }

  /**
   * Role names only for JWT `roles` claim — never embed permission rows or other objects.
   */
  static rolesClaimForToken(roles) {
    if (!Array.isArray(roles)) return [];
    const names = roles
      .map((r) => {
        if (typeof r === 'string' && r.length > 0) return r;
        if (r && typeof r === 'object' && typeof r.name === 'string' && r.name.length > 0) return r.name;
        return null;
      })
      .filter(Boolean);
    return [...new Set(names)];
  }

  /**
   * Generate access token (minimal claims: user_id, role name strings, type).
   * Permissions are resolved server-side (e.g. GET /users/me/permissions, RBAC middleware).
   */
  static generateAccessToken(userId, roles = []) {
    return jwt.sign(
      {
        user_id: userId,
        roles: this.rolesClaimForToken(roles),
        type: 'access'
      },
      jwtSecret,
      { expiresIn: jwtExpiresIn }
    );
  }

  /**
   * Generate refresh token
   */
  static generateRefreshToken(userId) {
    const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || jwtSecret;
    const JWT_REFRESH_EXPIRES = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
    
    return jwt.sign(
      { 
        user_id: userId,
        type: 'refresh',
        session_id: uuidv4()
      },
      JWT_REFRESH_SECRET,
      { expiresIn: JWT_REFRESH_EXPIRES }
    );
  }

  /**
   * Verify access token
   */
  static verifyAccessToken(token) {
    try {
      return jwt.verify(token, jwtSecret);
    } catch (error) {
      throw new Error('Invalid or expired token');
    }
  }

  /**
   * Refresh access token
   */
  static async refreshToken(refreshToken) {
    try {
      const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || jwtSecret;
      const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
      
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type');
      }
      
      // Get user roles for new access token
      const roles = await AuthModel.getUserRoles(payload.user_id);
      const roleNames = roles.map(r => r.name);
      
      // Generate new access token
      const accessToken = this.generateAccessToken(payload.user_id, roleNames);
      
      return {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 3600
      };
    } catch (error) {
      throw new Error('Invalid or expired refresh token');
    }
  }

  /**
   * Logout user
   */
  static async logout(userId, sessionId) {
    if (sessionId) {
      await AuthModel.revokeSession(sessionId);
    }
    return true;
  }

  // ── Email verification ─────────────────────────────────────────────────
  //
  // Single active token per user, stored as a sha256 hash on the users row.
  // Raw token only lives in the recipient's inbox. Resend overwrites.
  // TTL defaults to 24 hours; override with EMAIL_VERIFICATION_TTL_HOURS.

  static _verificationTtlMs() {
    const hours = Number(process.env.EMAIL_VERIFICATION_TTL_HOURS) || 24;
    return Math.max(1, hours) * 60 * 60 * 1000;
  }

  static _hashToken(token) {
    return require('crypto').createHash('sha256').update(token).digest('hex');
  }

  static _verifyUrl(token) {
    const base = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');
    return `${base}/auth/verify-email?token=${encodeURIComponent(token)}`;
  }

  /**
   * Issue (or re-issue) a verification token for the user, persist its
   * sha256 hash, and fire the verification email. Idempotent under
   * resend: the prior token is overwritten and becomes unverifiable.
   *
   * Returns the raw token for tests / non-email channels; callers in
   * production should ignore it and let the email do the work.
   */
  static async sendVerificationEmail(userId, { templateFile = 'email-verification.html' } = {}) {
    const pool = require('../../../db/pool');
    const sendEmail = require('../../../shared/utils/sendEmail');

    const userRes = await pool.query(
      `SELECT u.id, u.email, u.email_verified, p.first_name
         FROM users u LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) {
      const err = new Error('User not found');
      err.status = 404;
      err.error_code = 'user_not_found';
      throw err;
    }
    if (!user.email) {
      const err = new Error('User has no email address');
      err.status = 422;
      err.error_code = 'email_required';
      throw err;
    }
    if (user.email_verified) {
      const err = new Error('Email already verified');
      err.status = 409;
      err.error_code = 'already_verified';
      throw err;
    }

    const token = require('crypto').randomBytes(32).toString('hex');
    const tokenHash = AuthService._hashToken(token);
    const expiresAt = new Date(Date.now() + AuthService._verificationTtlMs());

    await pool.query(
      `UPDATE users
          SET email_verification_token_hash = $2,
              email_verification_expires_at = $3,
              updated_at = NOW()
        WHERE id = $1`,
      [userId, tokenHash, expiresAt.toISOString()]
    );

    // Fire-and-forget; deferred so the request handler's microtask tail
    // doesn't drag the SMTP RTT. Template uses %s array placeholders:
    // [first name, verify URL (button), verify URL (fallback monospace)].
    const verifyUrl = AuthService._verifyUrl(token);
    setImmediate(() => {
      sendEmail({
        to: user.email,
        subject: `Verify your email — ${process.env.APP_NAME || 'Registration Portal'}`,
        templateFile,
        placeholders: [user.first_name || 'there', verifyUrl, verifyUrl],
      }).catch(() => { /* logged in worker */ });
    });

    return { token, expiresAt: expiresAt.toISOString() };
  }

  /**
   * Resend variant — same as sendVerificationEmail but uses the
   * resend-verification template (different copy, same token mechanics).
   */
  static async resendVerificationEmail(userId) {
    return AuthService.sendVerificationEmail(userId, {
      templateFile: 'resend-verification.html',
    });
  }

  /**
   * Verify a raw token from the email link. Sets email_verified=true on
   * the matching user, clears the token, and stamps email_verified_at.
   * Returns the public user shape. Invalid / expired / already-used
   * tokens throw structured errors.
   */
  static async verifyEmailToken(rawToken) {
    if (!rawToken || typeof rawToken !== 'string') {
      const err = new Error('Token is required');
      err.status = 422;
      err.error_code = 'token_required';
      throw err;
    }
    const pool = require('../../../db/pool');
    const tokenHash = AuthService._hashToken(rawToken.trim());
    const r = await pool.query(
      `SELECT id, email, email_verified, email_verification_expires_at
         FROM users
        WHERE email_verification_token_hash = $1
        LIMIT 1`,
      [tokenHash]
    );
    const user = r.rows[0];
    if (!user) {
      const err = new Error('Invalid verification token');
      err.status = 400;
      err.error_code = 'invalid_token';
      throw err;
    }
    if (user.email_verified) {
      // Token matched but already verified — treat as success so users
      // who click the link twice don't see a scary error.
      return { id: user.id, email: user.email, email_verified: true };
    }
    if (
      user.email_verification_expires_at
      && new Date(user.email_verification_expires_at).getTime() < Date.now()
    ) {
      const err = new Error('Verification link has expired. Request a new one.');
      err.status = 410;
      err.error_code = 'token_expired';
      throw err;
    }

    await pool.query(
      `UPDATE users
          SET email_verified = TRUE,
              email_verified_at = NOW(),
              email_verification_token_hash = NULL,
              email_verification_expires_at = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [user.id]
    );
    return { id: user.id, email: user.email, email_verified: true };
  }
}

module.exports = AuthService;

