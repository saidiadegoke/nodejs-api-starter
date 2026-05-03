const pool = require('../../../db/pool');

class RegistrationModel {
  async appendHistory({ registration_id, from_status, to_status, reason, changed_by }) {
    await pool.query(
      `INSERT INTO jupeb_registration_status_history (registration_id, from_status, to_status, reason, changed_by)
       VALUES ($1, $2, $3, $4, $5)`,
      [registration_id, from_status || null, to_status, reason || null, changed_by]
    );
  }

  async findById(id) {
    const result = await pool.query(`SELECT * FROM jupeb_registrations WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async findByInstitutionCode(code) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registrations WHERE institution_issued_code = $1`,
      [String(code).trim()]
    );
    return result.rows[0] || null;
  }

  async findLatestForUser(userId) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registrations WHERE user_id = $1 ORDER BY updated_at DESC NULLS LAST, created_at DESC LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
  }

  async nextProvisionalSerial(sessionId, universityId) {
    const result = await pool.query(
      `SELECT COALESCE(MAX(provisional_serial), 0) + 1 AS n
       FROM jupeb_registrations WHERE session_id = $1 AND university_id = $2`,
      [sessionId, universityId]
    );
    return result.rows[0].n;
  }

  async insertRegistration(data) {
    const {
      session_id,
      university_id,
      user_id,
      subject_combination_id,
      nin_verification_id,
      institution_issued_code,
      provisional_serial,
      provisional_candidate_code,
      status,
      created_by,
      institution_code_expires_at,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_registrations (
        session_id, university_id, user_id, subject_combination_id, nin_verification_id,
        institution_issued_code, provisional_serial, provisional_candidate_code, status, created_by,
        institution_code_expires_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        session_id,
        university_id,
        user_id || null,
        subject_combination_id,
        nin_verification_id || null,
        institution_issued_code,
        provisional_serial,
        provisional_candidate_code,
        status,
        created_by,
        institution_code_expires_at || null,
      ]
    );
    return result.rows[0];
  }

  async updateRegistration(id, fields) {
    const allowed = [
      'user_id',
      'subject_combination_id',
      'nin_verification_id',
      'status',
      'status_reason',
      'dashboard_unlocked_at',
      'claimed_at',
      'submitted_at',
      'approved_at',
      'approved_by',
      'jupeb_candidate_number',
      'payment_projection',
      'institution_code_expires_at',
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        values.push(fields[k]);
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_registrations SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setBiometricSkip(id, captureType) {
    const column = captureType === 'face' ? 'face_skipped_at' : 'fingerprint_skipped_at';
    const result = await pool.query(
      `UPDATE jupeb_registrations
         SET ${column} = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateAcademicIntake(id, { sittings_count, result_types }) {
    const result = await pool.query(
      `UPDATE jupeb_registrations
         SET sittings_count = $2,
             result_types = $3::jsonb,
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 RETURNING *`,
      [id, sittings_count, JSON.stringify(result_types || [])]
    );
    return result.rows[0];
  }

  async listInstitution({ university_id, session_id, status, limit, offset }) {
    const values = [];
    let idx = 1;
    let q = `SELECT * FROM jupeb_registrations WHERE 1=1`;
    if (university_id) {
      q += ` AND university_id = $${idx++}`;
      values.push(university_id);
    }
    if (session_id) {
      q += ` AND session_id = $${idx++}`;
      values.push(session_id);
    }
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    q += ` ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async countInstitution({ university_id, session_id, status }) {
    const values = [];
    let idx = 1;
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_registrations WHERE 1=1`;
    if (university_id) {
      q += ` AND university_id = $${idx++}`;
      values.push(university_id);
    }
    if (session_id) {
      q += ` AND session_id = $${idx++}`;
      values.push(session_id);
    }
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
  }

  async findApprovedWithoutCandidateNumber(sessionId) {
    const result = await pool.query(
      `SELECT r.*, u.jupeb_prefix AS university_jupeb_prefix
       FROM jupeb_registrations r
       JOIN jupeb_universities u ON u.id = r.university_id
       WHERE r.session_id = $1 AND r.status = 'approved' AND r.jupeb_candidate_number IS NULL
       ORDER BY r.university_id, r.provisional_serial ASC`,
      [sessionId]
    );
    return result.rows;
  }

  async setCandidateNumber(id, number) {
    const result = await pool.query(
      `UPDATE jupeb_registrations SET jupeb_candidate_number = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`,
      [id, number]
    );
    return result.rows[0];
  }

  /** Idempotent finalize: only rows still without a final number are updated. */
  async setCandidateNumberIfNull(id, number) {
    const result = await pool.query(
      `UPDATE jupeb_registrations
       SET jupeb_candidate_number = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND jupeb_candidate_number IS NULL
       RETURNING *`,
      [id, number]
    );
    return result.rows[0];
  }
}

module.exports = new RegistrationModel();
