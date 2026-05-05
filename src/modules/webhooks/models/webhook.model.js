const pool = require('../../../db/pool');

class Webhook {
  static async create(userId, data) {
    const { url, events, secret, is_active = true } = data;
    const result = await pool.query(
      'INSERT INTO webhooks (user_id, url, events, secret, is_active) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [userId, url, events, secret, is_active]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT * FROM webhooks WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async findById(id, userId) {
    const result = await pool.query(
      'SELECT * FROM webhooks WHERE id = $1 AND user_id = $2',
      [id, userId]
    );
    return result.rows[0];
  }

  static async update(id, userId, data) {
    const { url, events, is_active } = data;
    const result = await pool.query(
      `UPDATE webhooks
       SET url = COALESCE($1, url),
           events = COALESCE($2, events),
           is_active = COALESCE($3, is_active),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [url, events, is_active, id, userId]
    );
    return result.rows[0];
  }

  static async delete(id, userId) {
    const result = await pool.query(
      'DELETE FROM webhooks WHERE id = $1 AND user_id = $2 RETURNING id',
      [id, userId]
    );
    return result.rows[0];
  }

  static async findActiveByEvent(userId, event) {
    const result = await pool.query(
      'SELECT * FROM webhooks WHERE user_id = $1 AND is_active = true AND $2 = ANY(events)',
      [userId, event]
    );
    return result.rows;
  }
}

module.exports = Webhook;
