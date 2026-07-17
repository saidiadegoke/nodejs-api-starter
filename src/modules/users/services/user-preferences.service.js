const UserPreferencesModel = require('../models/user-preferences.model');
const pool = require('../../../db/pool');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

class UserPreferencesService {
  static async getPreferences(userId) {
    const row = await UserPreferencesModel.findByUserId(userId);
    return row || UserPreferencesModel.defaults();
  }

  static async updatePreferences(userId, body = {}) {
    if (!body || typeof body !== 'object') {
      throw httpError(422, 'Body is required');
    }

    const patch = {};
    if (body.push_notifications_enabled !== undefined) {
      if (typeof body.push_notifications_enabled !== 'boolean') {
        throw httpError(422, 'push_notifications_enabled must be a boolean', {
          error_code: 'push_notifications_enabled_invalid',
        });
      }
      patch.push_notifications_enabled = body.push_notifications_enabled;
    }
    if (body.biometric_login_enabled !== undefined) {
      if (typeof body.biometric_login_enabled !== 'boolean') {
        throw httpError(422, 'biometric_login_enabled must be a boolean', {
          error_code: 'biometric_login_enabled_invalid',
        });
      }
      patch.biometric_login_enabled = body.biometric_login_enabled;
    }

    if (Object.keys(patch).length === 0) {
      throw httpError(422, 'No preference fields provided', {
        error_code: 'preferences_empty',
      });
    }

    return UserPreferencesModel.upsert(userId, patch);
  }

  /**
   * Soft-delete the current user and revoke all refresh sessions.
   * Requires exact confirmation string "DELETE".
   */
  static async deleteMyAccount(userId, body = {}) {
    if (!body || body.confirmation !== 'DELETE') {
      throw httpError(422, 'confirmation must be exactly "DELETE"', {
        error_code: 'confirmation_required',
      });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const deleted = await client.query(
        `UPDATE users
            SET deleted_at = NOW(), updated_at = NOW(), status = 'inactive'
          WHERE id = $1 AND deleted_at IS NULL
          RETURNING id`,
        [userId]
      );
      if (!deleted.rows[0]) {
        throw httpError(404, 'User not found');
      }

      await client.query(
        `UPDATE user_sessions
            SET is_revoked = true, revoked_at = NOW(), revoked_reason = 'account_deleted'
          WHERE user_id = $1 AND is_revoked = false`,
        [userId]
      );

      await client.query('COMMIT');
      return { deleted: true };
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
  }
}

module.exports = UserPreferencesService;
