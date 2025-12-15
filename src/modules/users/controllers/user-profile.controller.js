const pool = require('../../../db/pool');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND, BAD_REQUEST, CONFLICT } = require('../../../shared/constants/statusCodes');
const webSocketService = require('../../../shared/services/websocket.service');

class UserProfileController {
  /**
   * Get current user profile
   */
  static async getMe(req, res) {
    try {
      const userId = req.user.user_id;

      const result = await pool.query(
        `SELECT 
          u.id as user_id,
          u.email,
          u.phone,
          u.email_verified,
          u.phone_verified,
          u.status as account_status,
          u.created_at,
          u.updated_at,
          p.first_name,
          p.last_name,
          p.display_name,
          p.profile_photo_url as profile_photo,
          p.rating_average as rating,
          p.rating_count as total_ratings,
          p.total_orders,
          p.completed_orders
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return sendError(res, 'User not found', NOT_FOUND);
      }

      const user = result.rows[0];

      // Get user roles
      const rolesResult = await pool.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId]
      );

      const roles = rolesResult.rows.map(r => r.name);

      sendSuccess(res, {
        ...user,
        role: roles[0] || 'customer',
        roles: roles,
        verified: user.email_verified && user.phone_verified,
        kyc_status: 'not_submitted', // TODO: Implement KYC
        stats: {
          total_orders: user.total_orders || 0,
          completed_orders: user.completed_orders || 0
        },
        settings: {
          notifications_enabled: true,
          push_notifications: true,
          sms_notifications: true,
          email_notifications: true
        }
      }, 'Profile retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update current user profile
   */
  static async updateMe(req, res) {
    try {
      const userId = req.user.user_id;
      const { first_name, last_name, display_name, email, profile_photo_url } = req.body;

      // Check if email is being changed and if it's already taken
      if (email) {
        const existing = await pool.query(
          'SELECT id FROM users WHERE email = $1 AND id != $2',
          [email, userId]
        );

        if (existing.rows.length > 0) {
          return sendError(res, 'Email already in use', CONFLICT);
        }

        // Update email
        await pool.query(
          'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
          [email, userId]
        );
      }

      // Update profile
      if (first_name || last_name || display_name || profile_photo_url) {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (first_name) {
          updates.push(`first_name = $${paramIndex}`);
          params.push(first_name);
          paramIndex++;
        }

        if (last_name) {
          updates.push(`last_name = $${paramIndex}`);
          params.push(last_name);
          paramIndex++;
        }

        if (display_name) {
          updates.push(`display_name = $${paramIndex}`);
          params.push(display_name);
          paramIndex++;
        }

        if (profile_photo_url) {
          updates.push(`profile_photo_url = $${paramIndex}`);
          params.push(profile_photo_url);
          paramIndex++;
        }

        updates.push('updated_at = NOW()');
        params.push(userId);

        await pool.query(
          `UPDATE profiles
           SET ${updates.join(', ')}
           WHERE user_id = $${paramIndex}`,
          params
        );
      }

      // Get updated user (same format as getMe)
      const result = await pool.query(
        `SELECT 
          u.id as user_id,
          u.email,
          u.phone,
          u.email_verified,
          u.phone_verified,
          u.status as account_status,
          u.created_at,
          u.updated_at,
          p.first_name,
          p.last_name,
          p.display_name,
          p.profile_photo_url as profile_photo,
          p.rating_average as rating,
          p.rating_count as total_ratings,
          p.total_orders,
          p.completed_orders
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return sendError(res, 'User not found', NOT_FOUND);
      }

      const user = result.rows[0];

      // Get user roles
      const rolesResult = await pool.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId]
      );

      const roles = rolesResult.rows.map(r => r.name);

      const updatedUser = {
        ...user,
        role: roles[0] || 'customer',
        roles: roles,
        verified: user.email_verified && user.phone_verified,
        kyc_status: 'not_submitted',
        stats: {
          total_orders: user.total_orders || 0,
          completed_orders: user.completed_orders || 0
        },
        settings: {
          notifications_enabled: true,
          push_notifications: true,
          sms_notifications: true,
          email_notifications: true
        }
      };

      // Broadcast profile update to WebSocket clients
      webSocketService.broadcastUserProfileUpdate(userId, updatedUser);

      sendSuccess(res, updatedUser, 'Profile updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user statistics
   */
  static async getStats(req, res) {
    try {
      const userId = req.user.user_id;

      // Get user role
      const roleResult = await pool.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1
         LIMIT 1`,
        [userId]
      );

      const role = roleResult.rows[0]?.name || 'customer';

      const stats = {
        role: role,
        customer_stats: {
          total_orders: 0,
          completed_orders: 0,
          cancelled_orders: 0,
          total_spent: 0,
          average_order_value: 0,
          favorite_categories: []
        }
      };

      if (role === 'shopper' || role === 'dispatcher') {
        stats.provider_stats = {
          total_orders: 0,
          completed_orders: 0,
          cancelled_orders: 0,
          total_earned: 0,
          average_earnings_per_order: 0,
          acceptance_rate: 0,
          completion_rate: 0,
          rating_breakdown: {
            overall: 0,
            timeliness: 0,
            communication: 0,
            quality: 0
          },
          this_week: {
            orders: 0,
            earnings: 0
          },
          this_month: {
            orders: 0,
            earnings: 0
          }
        };
      }

      sendSuccess(res, stats, 'Statistics retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user by ID
   */
  static async getUserById(req, res) {
    try {
      const userId = req.params.user_id;

      const result = await pool.query(
        `SELECT 
          u.id as user_id,
          p.first_name,
          p.last_name,
          p.profile_photo_url as profile_photo,
          p.rating_average as rating,
          p.rating_count as total_ratings,
          u.created_at
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return sendError(res, 'User not found', NOT_FOUND);
      }

      // Get user role
      const roleResult = await pool.query(
        `SELECT r.name FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         WHERE ur.user_id = $1
         LIMIT 1`,
        [userId]
      );

      const userData = {
        ...result.rows[0],
        role: roleResult.rows[0]?.name || 'customer',
        verified: true
      };

      sendSuccess(res, userData, 'User retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update notification settings
   */
  static async updateNotificationSettings(req, res) {
    try {
      // Mock implementation - would update user_settings table
      sendSuccess(res, req.body, 'Notification settings updated', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = UserProfileController;


