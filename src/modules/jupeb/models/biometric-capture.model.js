const pool = require('../../../db/pool');

class BiometricCaptureModel {
  async create(data) {
    const {
      registration_id,
      capture_type,
      file_id,
      external_reference,
      quality_score,
      device_metadata,
      captured_at,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_biometric_captures (
        registration_id, capture_type, file_id, external_reference, quality_score, device_metadata, captured_at
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      RETURNING *`,
      [
        registration_id,
        capture_type,
        file_id || null,
        external_reference || null,
        quality_score != null ? Number(quality_score) : null,
        JSON.stringify(device_metadata || {}),
        captured_at,
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT b.*, r.user_id AS registration_user_id, r.university_id AS registration_university_id
       FROM jupeb_biometric_captures b
       JOIN jupeb_registrations r ON r.id = b.registration_id
       WHERE b.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByRegistrationId(registrationId) {
    const result = await pool.query(
      `SELECT * FROM jupeb_biometric_captures WHERE registration_id = $1 ORDER BY created_at ASC`,
      [registrationId]
    );
    return result.rows;
  }

  async deleteById(id) {
    const result = await pool.query(`DELETE FROM jupeb_biometric_captures WHERE id = $1 RETURNING *`, [id]);
    return result.rows[0] || null;
  }

  async markReplaced(id) {
    const result = await pool.query(
      `UPDATE jupeb_biometric_captures SET replaced_at = CURRENT_TIMESTAMP WHERE id = $1 AND replaced_at IS NULL RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = new BiometricCaptureModel();
