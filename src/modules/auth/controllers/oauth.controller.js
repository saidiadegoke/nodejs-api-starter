/**
 * OAuth Controller
 *
 * Handles OAuth authentication callbacks and token generation
 */

const AuthService = require('../services/auth.service');
const AuthModel = require('../models/auth.model');
const bcrypt = require('bcryptjs');

class OAuthController {
  /**
   * Handle OAuth callback success
   * Generates JWT tokens and redirects to frontend with tokens
   */
  static async handleOAuthCallback(req, res) {
    try {
      if (!req.user) {
        // OAuth authentication failed
        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        return res.redirect(`${frontendUrl}/login?error=auth_failed`);
      }

      // Get user roles
      const roles = await AuthModel.getUserRoles(req.user.id);
      const roleNames = roles.map(r => r.name);

      // Generate JWT tokens
      const accessToken = AuthService.generateAccessToken(req.user.id, roleNames);
      const refreshToken = AuthService.generateRefreshToken(req.user.id);

      // Create session
      const refreshTokenHash = await bcrypt.hash(refreshToken, 10);
      const deviceInfo = {
        ip_address: req.ip,
        user_agent: req.headers['user-agent']
      };
      await AuthModel.createSession(req.user.id, refreshTokenHash, deviceInfo);

      // Update last login
      const pool = require('../../../db/pool');
      await pool.query(
        'UPDATE users SET last_login_at = NOW() WHERE id = $1',
        [req.user.id]
      );

      // Set HTTP-only cookie for refresh token
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to frontend with access token in URL (will be stored in localStorage)
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const redirectUrl = `${frontendUrl}/auth/callback?token=${accessToken}`;

      res.redirect(redirectUrl);
    } catch (error) {
      console.error('OAuth callback error:', error);
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      res.redirect(`${frontendUrl}/login?error=server_error`);
    }
  }

  /**
   * Handle OAuth authentication failure
   */
  static handleOAuthFailure(req, res) {
    console.error('OAuth authentication failed');
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    res.redirect(`${frontendUrl}/login?error=auth_failed`);
  }
}

module.exports = OAuthController;
