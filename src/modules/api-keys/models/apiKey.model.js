const pool = require('../../../db/pool');

class ApiKey {
  static async create(userId, name, keyPrefix, keyHash) {
    const result = await pool.query(
      'INSERT INTO api_keys (user_id, name, key_prefix, key_hash) VALUES ($1, $2, $3, $4) RETURNING id, name, key_prefix, status, created_at',
      [userId, name, keyPrefix, keyHash]
    );
    return result.rows[0];
  }

  static async findByUserId(userId) {
    const result = await pool.query(
      'SELECT id, name, key_prefix, status, last_used_at, created_at FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );
    return result.rows;
  }

  static async findByHash(keyHash) {
    const result = await pool.query(
      "SELECT * FROM api_keys WHERE key_hash = $1 AND status = 'active'",
      [keyHash]
    );
    return result.rows[0];
  }

  static async revoke(id, userId) {
    const result = await pool.query(
      "UPDATE api_keys SET status = 'revoked' WHERE id = $1 AND user_id = $2 RETURNING id, name, key_prefix, status, created_at",
      [id, userId]
    );
    return result.rows[0];
  }

  static async touchLastUsed(id) {
    await pool.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [id]);
  }
}

module.exports = ApiKey;
