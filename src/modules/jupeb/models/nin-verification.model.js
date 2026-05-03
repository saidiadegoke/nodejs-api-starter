const pool = require('../../../db/pool');

const RETURNING_COLUMNS = `
  id, nin_hash, nin_last4, provider, provider_reference, idempotency_key, status,
  response_payload, error_payload, verified_at, requested_by, created_at,
  intake_payload, retry_after, attempt_count, last_attempt_at, last_error_code
`;

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
      RETURNING ${RETURNING_COLUMNS}`,
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

  async createPending(data) {
    const {
      nin_hash,
      nin_last4,
      provider,
      idempotency_key,
      intake_payload,
      retry_after,
      last_error_code,
      requested_by,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_nin_verifications (
        nin_hash, nin_last4, provider, idempotency_key, status,
        response_payload, error_payload, requested_by,
        intake_payload, retry_after, attempt_count, last_attempt_at, last_error_code
      ) VALUES ($1, $2, $3, $4, 'pending', '{}'::jsonb, '{}'::jsonb, $5, $6::jsonb, $7, 1, CURRENT_TIMESTAMP, $8)
      RETURNING ${RETURNING_COLUMNS}`,
      [
        nin_hash,
        nin_last4,
        provider,
        idempotency_key || null,
        requested_by || null,
        JSON.stringify(intake_payload || {}),
        retry_after || null,
        last_error_code || null,
      ]
    );
    return result.rows[0];
  }

  async markVerified(id, { response_payload, provider_reference }) {
    const result = await pool.query(
      `UPDATE jupeb_nin_verifications
         SET status = 'verified',
             response_payload = $2::jsonb,
             provider_reference = COALESCE($3, provider_reference),
             error_payload = '{}'::jsonb,
             verified_at = CURRENT_TIMESTAMP,
             retry_after = NULL,
             last_error_code = NULL,
             last_attempt_at = CURRENT_TIMESTAMP,
             attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING ${RETURNING_COLUMNS}`,
      [id, JSON.stringify(response_payload || {}), provider_reference || null]
    );
    return result.rows[0] || null;
  }

  async markFailed(id, { error_payload, last_error_code }) {
    const result = await pool.query(
      `UPDATE jupeb_nin_verifications
         SET status = 'failed',
             error_payload = $2::jsonb,
             retry_after = NULL,
             last_error_code = $3,
             last_attempt_at = CURRENT_TIMESTAMP,
             attempt_count = attempt_count + 1
       WHERE id = $1
       RETURNING ${RETURNING_COLUMNS}`,
      [id, JSON.stringify(error_payload || {}), last_error_code || null]
    );
    return result.rows[0] || null;
  }

  async incrementAttempt(id, { retry_after, last_error_code }) {
    const result = await pool.query(
      `UPDATE jupeb_nin_verifications
         SET retry_after = $2,
             last_error_code = $3,
             last_attempt_at = CURRENT_TIMESTAMP,
             attempt_count = attempt_count + 1
       WHERE id = $1 AND status = 'pending'
       RETURNING ${RETURNING_COLUMNS}`,
      [id, retry_after || null, last_error_code || null]
    );
    return result.rows[0] || null;
  }

  async findDuePending({ now, limit }) {
    const safeLimit = Math.max(1, Math.min(500, parseInt(limit, 10) || 50));
    const cutoff = (now instanceof Date ? now : new Date()).toISOString();
    const result = await pool.query(
      `SELECT * FROM jupeb_nin_verifications
       WHERE status = 'pending' AND retry_after IS NOT NULL AND retry_after <= $1
       ORDER BY retry_after ASC
       LIMIT $2`,
      [cutoff, safeLimit]
    );
    return result.rows;
  }
}

module.exports = new NinVerificationModel();
