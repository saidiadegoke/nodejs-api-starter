const AuthService = require('../services/auth.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, UNAUTHORIZED, CONFLICT, UNPROCESSABLE_ENTITY } = require('../../../shared/constants/statusCodes');

class AuthController {
  /**
   * Register new user
   */
  static async register(req, res) {
    try {
      const user = await AuthService.register(req.body);
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
      const user = await AuthModel.findByIdentifier(identifier);
      if (!user) {
        // Don't reveal if user exists
        return sendSuccess(res, { 
          reset_initiated: true,
          method: 'sms',
          masked_recipient: '***'
        }, 'Password reset code sent', OK);
      }
      
      // Mock implementation - would send actual reset code
      const method = user.email ? 'email' : 'sms';
      const masked = user.email 
        ? user.email.replace(/(.{2})(.*)(@.*)/, '$1***$3')
        : user.phone.replace(/(\+\d{3})(.*)(\d{4})/, '$1***$3');
      
      sendSuccess(res, { 
        reset_initiated: true,
        method,
        masked_recipient: masked
      }, 'Password reset code sent', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Reset password
   */
  static async resetPassword(req, res) {
    try {
      const { identifier, reset_code, new_password } = req.body;
      
      if (!identifier || !reset_code || !new_password) {
        return sendError(res, 'All fields are required', BAD_REQUEST);
      }
      
      const bcrypt = require('bcryptjs');
      const AuthModel = require('../models/auth.model');
      const pool = require('../../../db/pool');
      
      const user = await AuthModel.findByIdentifier(identifier);
      if (!user) {
        return sendError(res, 'User not found', BAD_REQUEST);
      }
      
      // Mock implementation - would verify reset code from database
      // For testing, accept '123456' or if USE_MOCK_OTP is true
      if (reset_code === '123456') {
        const newHash = await bcrypt.hash(new_password, 10);
        await pool.query(
          'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
          [newHash, user.id]
        );
        
        sendSuccess(res, null, 'Password reset successfully', OK);
      } else {
        sendError(res, 'Invalid reset code', BAD_REQUEST);
      }
    } catch (error) {
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

