const pool = require('../../../db/pool');

class RegistrationResultModel {
  async upsertRow({ registration_id, course_id, grade, plus_one_awarded, entered_by }) {
    const result = await pool.query(
      `INSERT INTO jupeb_registration_results (registration_id, course_id, grade, plus_one_awarded, entered_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (registration_id, course_id) DO UPDATE SET
         grade = EXCLUDED.grade,
         plus_one_awarded = EXCLUDED.plus_one_awarded,
         entered_by = EXCLUDED.entered_by,
         entered_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [registration_id, course_id, grade, plus_one_awarded, entered_by]
    );
    return result.rows[0];
  }

  async findByRegistrationId(registrationId) {
    const result = await pool.query(
      `SELECT r.*, c.code AS course_code, c.title AS course_title
       FROM jupeb_registration_results r
       JOIN jupeb_courses c ON c.id = r.course_id
       WHERE r.registration_id = $1
       ORDER BY c.code ASC`,
      [registrationId]
    );
    return result.rows;
  }
}

module.exports = new RegistrationResultModel();
