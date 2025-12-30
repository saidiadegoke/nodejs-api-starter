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
      
      // Send welcome email asynchronously if user has email
      if (user.email && req.body.first_name) {
        const sendEmail = require('../../../shared/utils/sendEmail');
        const welcomeUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/`;
        
        sendEmail({
          to: user.email,
          subject: 'Welcome to OpinionPulse!',
          templateFile: 'shared/emails/welcome.html',
          placeholders: [
            req.body.first_name || 'User',
            welcomeUrl,
            user.email
          ]
        }).then(() => {
          console.log('Welcome email sent to:', user.email);
        }).catch((emailError) => {
          console.error('Failed to send welcome email:', emailError);
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
   * Verify phone number
   */
  static async verifyPhone(req, res) {
    try {
      const pool = require('../../../db/pool');
      const { phone, otp } = req.body;
      
      if (!phone || !otp) {
        return sendError(res, 'Phone and OTP are required', BAD_REQUEST);
      }
      
      // In production, verify OTP from SMS service or database
      // For testing/development, accept '123456' as valid OTP
      if (otp === '123456') {
        // Mark phone as verified
        const result = await pool.query(
          `UPDATE users SET phone_verified = true, updated_at = NOW() WHERE phone = $1 RETURNING id`,
          [phone]
        );
        
        if (result.rows.length > 0) {
          sendSuccess(res, { 
            verified: true, 
            user_id: result.rows[0].id 
          }, 'Phone number verified successfully', OK);
        } else {
          sendError(res, 'User not found', BAD_REQUEST);
        }
      } else {
        sendError(res, 'Invalid OTP', BAD_REQUEST);
      }
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Resend OTP
   */
  static async resendOtp(req, res) {
    try {
      const { phone } = req.body;
      
      // Mock implementation - would send actual SMS
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      
      sendSuccess(res, { 
        sent: true, 
        expires_at: expiresAt.toISOString() 
      }, 'OTP sent successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
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
        const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
        
        // Send email asynchronously - don't wait for it
        sendEmail({
          to: user.email,
          subject: 'Reset Your OpinionPulse Password',
          templateFile: 'shared/emails/forgot-password.html',
          placeholders: [
            user.first_name || user.display_name || 'User',
            resetUrl,
            resetUrl,
            user.email
          ]
        }).then(() => {
          console.log('Password reset email sent successfully to:', user.email);
        }).catch((emailError) => {
          console.error('Failed to send reset email:', emailError);
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
      
      if (!token || !new_password) {
        return sendError(res, 'Reset token and new password are required', BAD_REQUEST);
      }
      
      const bcrypt = require('bcryptjs');
      const crypto = require('crypto');
      const pool = require('../../../db/pool');
      
      // Hash the provided token to match against stored hash
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      
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
        const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/login`;
        const resetDate = new Date().toLocaleDateString('en-US', { 
          year: 'numeric', 
          month: 'long', 
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        sendEmail({
          to: resetRecord.email,
          subject: 'Password Reset Successful - OpinionPulse',
          templateFile: 'shared/emails/password-reset-success.html',
          placeholders: [
            resetRecord.first_name || 'User',
            resetDate,
            loginUrl,
            resetDate,
            resetRecord.email
          ]
        }).then(() => {
          console.log('Password reset success email sent to:', resetRecord.email);
        }).catch((emailError) => {
          console.error('Failed to send password reset success email:', emailError);
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

