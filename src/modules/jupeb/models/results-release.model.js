const pool = require('../../../db/pool');

class ResultsReleaseModel {
  async findSession(identifier) {
    if (identifier) {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(identifier));
      if (isUuid) {
        const r = await pool.query('SELECT * FROM jupeb_registration_sessions WHERE id = $1', [identifier]);
        return r.rows[0] || null;
      }
      const r = await pool.query('SELECT * FROM jupeb_registration_sessions WHERE academic_year = $1', [identifier]);
      return r.rows[0] || null;
    }
    // Default to open session or latest session
    const r = await pool.query(
      `SELECT * FROM jupeb_registration_sessions 
       ORDER BY (status = 'open') DESC, academic_year DESC, created_at DESC 
       LIMIT 1`
    );
    return r.rows[0] || null;
  }

  async updateSessionRelease(sessionId, release, userId) {
    const r = await pool.query(
      `UPDATE jupeb_registration_sessions
       SET results_released_to_institutions = $1,
           results_released_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE NULL END,
           results_released_by = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3
       RETURNING *`,
      [Boolean(release), userId || null, sessionId]
    );
    return r.rows[0] || null;
  }

  async findInstitutionSessionResult(sessionId, universityId) {
    const r = await pool.query(
      `SELECT * FROM jupeb_institution_session_results
       WHERE session_id = $1 AND university_id = $2`,
      [sessionId, universityId]
    );
    return r.rows[0] || null;
  }

  async upsertInstitutionSessionResult(sessionId, universityId, release, userId) {
    const r = await pool.query(
      `INSERT INTO jupeb_institution_session_results (
         session_id, university_id, results_released_to_students, students_results_released_at, released_by, updated_at
       ) VALUES ($1, $2, $3, CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (session_id, university_id)
       DO UPDATE SET
         results_released_to_students = EXCLUDED.results_released_to_students,
         students_results_released_at = EXCLUDED.students_results_released_at,
         released_by = EXCLUDED.released_by,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [sessionId, universityId, Boolean(release), userId || null]
    );
    return r.rows[0] || null;
  }

  async releaseAllRegistrationsForInstitution(sessionId, universityId, userId) {
    const r = await pool.query(
      `UPDATE jupeb_registrations
       SET is_result_released = true,
           result_released_at = CURRENT_TIMESTAMP,
           result_released_by = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND university_id = $2
       RETURNING id`,
      [sessionId, universityId, userId || null]
    );
    return r.rows.map(row => row.id);
  }

  async releaseRegistrationsByIds(sessionId, universityId, registrationIds, userId) {
    if (!registrationIds || !registrationIds.length) return [];
    const r = await pool.query(
      `UPDATE jupeb_registrations
       SET is_result_released = true,
           result_released_at = CURRENT_TIMESTAMP,
           result_released_by = $4,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = $1 AND university_id = $2 AND id = ANY($3::uuid[])
       RETURNING id`,
      [sessionId, universityId, registrationIds, userId || null]
    );
    return r.rows.map(row => row.id);
  }

  async listInstitutionCandidates(sessionId, universityId, { q, limit = 50, offset = 0 } = {}) {
    const values = [sessionId, universityId];
    let queryFilter = '';
    if (q) {
      values.push(`%${q}%`);
      const idx = values.length;
      queryFilter = `AND (
        r.jupeb_candidate_number ILIKE $${idx} OR 
        r.provisional_candidate_code ILIKE $${idx} OR 
        p.first_name ILIKE $${idx} OR 
        p.last_name ILIKE $${idx} OR 
        u.email ILIKE $${idx}
      )`;
    }

    values.push(limit, offset);
    const limitIdx = values.length - 1;
    const offsetIdx = values.length;

    const countRes = await pool.query(
      `SELECT COUNT(*)::int AS total
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       WHERE r.session_id = $1 AND r.university_id = $2 ${queryFilter}`,
      values.slice(0, values.length - 2)
    );

    const rowsRes = await pool.query(
      `SELECT r.id, r.session_id, r.university_id, r.user_id,
              r.jupeb_candidate_number, r.provisional_candidate_code,
              r.status, r.payment_projection, r.is_result_released, r.result_released_at,
              p.first_name, p.last_name, p.display_name, u.phone, u.email
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       WHERE r.session_id = $1 AND r.university_id = $2 ${queryFilter}
       ORDER BY r.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values
    );

    return {
      total: countRes.rows[0]?.total || 0,
      candidates: rowsRes.rows,
    };
  }

  async checkStudentReleaseStatus(sessionId, universityId, registrationId) {
    const r = await pool.query(
      `SELECT 
         s.results_released_to_institutions,
         s.results_released_at AS central_released_at,
         COALESCE(isr.results_released_to_students, false) AS institution_released_to_all,
         isr.students_results_released_at AS institution_released_at,
         COALESCE(r.is_result_released, false) AS registration_released,
         r.result_released_at AS student_released_at
       FROM jupeb_registration_sessions s
       LEFT JOIN jupeb_institution_session_results isr 
         ON isr.session_id = s.id AND isr.university_id = $2
       LEFT JOIN jupeb_registrations r 
         ON r.id = $3
       WHERE s.id = $1`,
      [sessionId, universityId, registrationId]
    );
    return r.rows[0] || null;
  }
}

module.exports = new ResultsReleaseModel();
