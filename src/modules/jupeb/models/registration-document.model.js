const pool = require('../../../database/pool');

class RegistrationDocumentModel {
  async findById(id) {
    const result = await pool.query(
      `SELECT d.*, r.user_id AS registration_user_id, r.university_id AS registration_university_id
       FROM jupeb_registration_documents d
       JOIN jupeb_registrations r ON r.id = d.registration_id
       WHERE d.id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async findByRegistration(registrationId) {
    const result = await pool.query(
      `SELECT d.* FROM jupeb_registration_documents d
       WHERE d.registration_id = $1
       ORDER BY d.created_at ASC`,
      [registrationId]
    );
    return result.rows;
  }

  async findCurrentSubmittedOrAccepted(registrationId, requirementId) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registration_documents
       WHERE registration_id = $1 AND requirement_id = $2 AND status IN ('submitted', 'accepted')
       ORDER BY created_at DESC LIMIT 1`,
      [registrationId, requirementId]
    );
    return result.rows[0] || null;
  }

  async findCurrentBySourceSitting(registrationId, source, sitting) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registration_documents
       WHERE registration_id = $1
         AND source = $2
         AND sitting = $3
         AND status IN ('submitted', 'accepted')
       ORDER BY created_at DESC LIMIT 1`,
      [registrationId, source, sitting]
    );
    return result.rows[0] || null;
  }

  async create(data) {
    const { registration_id, requirement_id, file_id, status, source, sitting, institution_type } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_registration_documents
         (registration_id, requirement_id, file_id, status, source, sitting, institution_type)
       VALUES ($1, $2, $3, COALESCE($4, 'submitted'), $5, $6, $7)
       RETURNING *`,
      [
        registration_id,
        requirement_id,
        file_id,
        status || 'submitted',
        source || null,
        sitting || null,
        institution_type || null
      ]
    );
    return result.rows[0];
  }

  async markReplaced(id) {
    const result = await pool.query(
      `UPDATE jupeb_registration_documents SET status = 'replaced', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  async markDeleted(id) {
    const result = await pool.query(
      `UPDATE jupeb_registration_documents SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  async setReview(id, { status, review_note, reviewed_by }) {
    const result = await pool.query(
      `UPDATE jupeb_registration_documents
       SET status = $2, review_note = $3, reviewed_by = $4, reviewed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *`,
      [id, status, review_note || null, reviewed_by || null]
    );
    return result.rows[0];
  }

  async updateFile(id, file_id) {
    const result = await pool.query(
      `UPDATE jupeb_registration_documents SET file_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, file_id]
    );
    return result.rows[0];
  }
}

module.exports = new RegistrationDocumentModel();
