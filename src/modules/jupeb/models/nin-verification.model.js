const pool = require('../../../db/pool');

class NinVerificationModel {
  async findByIdempotencyKey(key) {
    if (!key) return null;
    const result = await pool.query(
      `SELECT * FROM jupeb_nin_verifications WHERE idempotency_key = $1 ORDER BY created_at DESC LIMIT 1`,
      [key]
    );
    return result.rows[0] || null;
  }

  async findById(id) {
    const result = await pool.query(`SELECT * FROM jupeb_nin_verifications WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async create(data) {
    const {
      nin_hash,
      nin_last4,
      provider,
      provider_reference,
      idempotency_key,
      status,
      response_payload,
      error_payload,
      verified_at,
      requested_by,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_nin_verifications (
        nin_hash, nin_last4, provider, provider_reference, idempotency_key, status,
        response_payload, error_payload, verified_at, requested_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
      RETURNING *`,
      [
        nin_hash,
        nin_last4,
        provider,
        provider_reference || null,
        idempotency_key || null,
        status,
        JSON.stringify(response_payload || {}),
        JSON.stringify(error_payload || {}),
        verified_at || null,
        requested_by || null,
      ]
    );
    return result.rows[0];
  }
}

module.exports = new NinVerificationModel();
