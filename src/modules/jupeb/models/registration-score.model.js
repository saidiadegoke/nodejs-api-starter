const pool = require('../../../db/pool');

class RegistrationScoreModel {
  async upsertSnapshot({ registration_id, passed_courses_count, failed_courses_count, plus_one_total }) {
    const result = await pool.query(
      `INSERT INTO jupeb_registration_scores (registration_id, passed_courses_count, failed_courses_count, plus_one_total, computed_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (registration_id) DO UPDATE SET
         passed_courses_count = EXCLUDED.passed_courses_count,
         failed_courses_count = EXCLUDED.failed_courses_count,
         plus_one_total = EXCLUDED.plus_one_total,
         computed_at = EXCLUDED.computed_at
       RETURNING *`,
      [registration_id, passed_courses_count, failed_courses_count, plus_one_total]
    );
    return result.rows[0];
  }

  async findByRegistrationId(registrationId) {
    const result = await pool.query(`SELECT * FROM jupeb_registration_scores WHERE registration_id = $1`, [
      registrationId,
    ]);
    return result.rows[0] || null;
  }
}

module.exports = new RegistrationScoreModel();
