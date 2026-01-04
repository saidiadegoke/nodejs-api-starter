const pool = require('../../../db/pool');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, NOT_FOUND, BAD_REQUEST, CONFLICT } = require('../../../shared/constants/statusCodes');
const webSocketService = require('../../../shared/services/websocket.service');
const { getUserPermissions } = require('../../../shared/middleware/rbac.middleware');

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
          p.bio,
          p.date_of_birth,
          p.gender,
          p.country_id,
          c.name as country_name,
          c.iso_code_2 as country_code,
          p.state_province,
          p.educational_level,
          p.employment_status,
          p.profile_completed,
          p.rating_average as rating,
          p.rating_count as total_ratings,
          p.total_orders,
          p.completed_orders
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        LEFT JOIN countries c ON p.country_id = c.id
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
      const {
        first_name,
        last_name,
        display_name,
        email,
        profile_photo_url,
        bio,
        date_of_birth,
        gender,
        country_id,
        state_province,
        educational_level,
        employment_status
      } = req.body;

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
      const updates = [];
      const params = [];
      let paramIndex = 1;

      if (first_name !== undefined) {
        updates.push(`first_name = $${paramIndex}`);
        params.push(first_name);
        paramIndex++;
      }

      if (last_name !== undefined) {
        updates.push(`last_name = $${paramIndex}`);
        params.push(last_name);
        paramIndex++;
      }

      if (display_name !== undefined) {
        updates.push(`display_name = $${paramIndex}`);
        params.push(display_name);
        paramIndex++;
      }

      if (profile_photo_url !== undefined) {
        updates.push(`profile_photo_url = $${paramIndex}`);
        params.push(profile_photo_url);
        paramIndex++;
      }

      if (bio !== undefined) {
        updates.push(`bio = $${paramIndex}`);
        params.push(bio);
        paramIndex++;
      }

      if (date_of_birth !== undefined) {
        updates.push(`date_of_birth = $${paramIndex}`);
        params.push(date_of_birth);
        paramIndex++;
      }

      if (gender !== undefined) {
        updates.push(`gender = $${paramIndex}`);
        params.push(gender);
        paramIndex++;
      }

      if (country_id !== undefined) {
        updates.push(`country_id = $${paramIndex}`);
        params.push(country_id);
        paramIndex++;
      }

      if (state_province !== undefined) {
        updates.push(`state_province = $${paramIndex}`);
        params.push(state_province);
        paramIndex++;
      }

      if (educational_level !== undefined) {
        updates.push(`educational_level = $${paramIndex}`);
        params.push(educational_level);
        paramIndex++;
      }

      if (employment_status !== undefined) {
        updates.push(`employment_status = $${paramIndex}`);
        params.push(employment_status);
        paramIndex++;
      }

      if (updates.length > 0) {
        // Check if profile should be marked as completed
        // Required fields for completion: date_of_birth, gender, country_id, educational_level, employment_status
        const currentProfile = await pool.query(
          `SELECT date_of_birth, gender, country_id, educational_level, employment_status
           FROM profiles WHERE user_id = $1`,
          [userId]
        );

        let profileCompleted = false;
        if (currentProfile.rows.length > 0) {
          const profile = currentProfile.rows[0];

          // Merge current values with updates
          const finalDateOfBirth = date_of_birth !== undefined ? date_of_birth : profile.date_of_birth;
          const finalGender = gender !== undefined ? gender : profile.gender;
          const finalCountryId = country_id !== undefined ? country_id : profile.country_id;
          const finalEducationalLevel = educational_level !== undefined ? educational_level : profile.educational_level;
          const finalEmploymentStatus = employment_status !== undefined ? employment_status : profile.employment_status;

          // Mark as completed if all demographic fields are filled
          profileCompleted = !!(finalDateOfBirth && finalGender && finalCountryId && finalEducationalLevel && finalEmploymentStatus);
        }

        if (profileCompleted) {
          updates.push(`profile_completed = $${paramIndex}`);
          params.push(true);
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
          p.bio,
          p.date_of_birth,
          p.gender,
          p.country_id,
          c.name as country_name,
          c.iso_code_2 as country_code,
          p.state_province,
          p.educational_level,
          p.employment_status,
          p.profile_completed,
          p.rating_average as rating,
          p.rating_count as total_ratings,
          p.total_orders,
          p.completed_orders
        FROM users u
        LEFT JOIN profiles p ON u.id = p.user_id
        LEFT JOIN countries c ON p.country_id = c.id
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
   * Get current user permissions
   */
  static async getMyPermissions(req, res) {
    try {
      const userId = req.user.user_id;
      const permissions = await getUserPermissions(userId);
      
      sendSuccess(res, { permissions }, 'Permissions retrieved successfully', OK);
    } catch (error) {
      console.error('Error getting user permissions:', error);
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

  /**
   * Get list of countries
   */
  static async getCountries(req, res) {
    try {
      const result = await pool.query(
        `SELECT id, name, iso_code_2, iso_code_3, phone_code, currency_code
         FROM countries
         WHERE is_active = true
         ORDER BY name ASC`
      );

      sendSuccess(res, result.rows, 'Countries retrieved successfully', OK);
    } catch (error) {
      console.error('Error getting countries:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's own stories (context sources)
   */
  static async getUserStories(req, res) {
    try {
      const userId = req.user.user_id;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // Get user's context sources with accurate counts
      const result = await pool.query(
        `SELECT 
          cs.id,
          cs.title,
          cs.summary,
          cs.source_type,
          cs.source_url,
          cs.author,
          cs.publisher,
          cs.publication_date,
          cs.credibility_score,
          cs.tags,
          cs.created_at,
          cs.updated_at,
          COALESCE(comment_counts.comment_count, 0) as comments,
          COALESCE(view_counts.view_count, 0) as views
        FROM context_sources cs
        LEFT JOIN (
          SELECT 
            commentable_id,
            COUNT(*) as comment_count
          FROM comments 
          WHERE commentable_type = 'context_source'
          GROUP BY commentable_id
        ) comment_counts ON comment_counts.commentable_id = cs.id
        LEFT JOIN (
          SELECT 
            source_id,
            COUNT(DISTINCT user_id) as view_count
          FROM context_engagements 
          WHERE engagement_type = 'view'
          GROUP BY source_id
        ) view_counts ON view_counts.source_id = cs.id
        WHERE cs.created_by = $1
        ORDER BY cs.created_at DESC
        LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      // Get total count
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM context_sources WHERE created_by = $1',
        [userId]
      );

      const total = parseInt(countResult.rows[0].count);
      const pages = Math.ceil(total / limit);

      sendSuccess(res, {
        stories: result.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages
        }
      }, 'User stories retrieved successfully', OK);
    } catch (error) {
      console.error('Error getting user stories:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = UserProfileController;


