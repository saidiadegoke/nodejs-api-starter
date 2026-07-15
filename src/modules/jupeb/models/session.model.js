const pool = require('../../../db/pool');

class SessionModel {
  async create(data) {
    const {
      academic_year,
      year_short,
      opens_at,
      closes_at,
      student_submission_deadline,
      institution_approval_deadline,
      notes,
      created_by,
      registration_fee_amount,
      registration_fee_currency,
      candidate_info_cutoff_at,
      profile_update_cutoff_at,
      ca_cutoff_at,
      max_ca_score,
      affiliation_fee_existing,
      affiliation_fee_new,
      exam_fee_per_candidate,
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_registration_sessions (
        academic_year, year_short, status, opens_at, closes_at,
        student_submission_deadline, institution_approval_deadline, notes, created_by, updated_by,
        registration_fee_amount, registration_fee_currency,
        candidate_info_cutoff_at, profile_update_cutoff_at, ca_cutoff_at, max_ca_score,
        affiliation_fee_existing, affiliation_fee_new, exam_fee_per_candidate
      ) VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8, $8, $9, COALESCE($10, 'NGN'),
                $11, $12, $13, $14, $15, $16, $17)
      RETURNING *`,
      [
        academic_year.trim(),
        year_short.trim(),
        opens_at,
        closes_at,
        student_submission_deadline || null,
        institution_approval_deadline || null,
        notes || null,
        created_by || null,
        registration_fee_amount != null ? registration_fee_amount : null,
        registration_fee_currency ? String(registration_fee_currency).trim().toUpperCase().slice(0, 3) : null,
        candidate_info_cutoff_at || null,
        profile_update_cutoff_at || null,
        ca_cutoff_at || null,
        max_ca_score != null ? max_ca_score : null,
        affiliation_fee_existing != null ? affiliation_fee_existing : null,
        affiliation_fee_new != null ? affiliation_fee_new : null,
        exam_fee_per_candidate != null ? exam_fee_per_candidate : null,
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM jupeb_registration_sessions WHERE id = $1`,
      [id]
    );
    return result.rows[0];
  }

  _where({ status, q }) {
    const values = [];
    const where = ['1=1'];
    let idx = 1;
    if (status) {
      where.push(`status = $${idx++}`);
      values.push(status);
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where.push(`(
        academic_year ILIKE $${idx} OR
        year_short ILIKE $${idx}
      )`);
      values.push(term);
      idx += 1;
    }
    return { whereSql: where.join(' AND '), values, nextIdx: idx };
  }

  async findAll({ limit, offset, status, q }) {
    const { whereSql, values, nextIdx } = this._where({ status, q });
    values.push(limit, offset);
    // Latest session first. academic_year is NOT NULL + UNIQUE and fixed
    // 'YYYY/YYYY' width, so it sorts chronologically with no NULL/tie
    // edge cases.
    const sql = `SELECT * FROM jupeb_registration_sessions WHERE ${whereSql}
                 ORDER BY academic_year DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async count({ status, q }) {
    const { whereSql, values } = this._where({ status, q });
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_registration_sessions WHERE ${whereSql}`,
      values
    );
    return result.rows[0].c;
  }

  async countOtherOpenSessions(excludeId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_registration_sessions
       WHERE status = 'open' AND id <> $1`,
      [excludeId]
    );
    return result.rows[0].c;
  }

  async countOpenSessions() {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_registration_sessions WHERE status = 'open'`
    );
    return result.rows[0].c;
  }

  async closeOpenSessions(updatedBy) {
    await pool.query(
      `UPDATE jupeb_registration_sessions
       SET status = 'closed', updated_at = CURRENT_TIMESTAMP, updated_by = $1
       WHERE status = 'open'`,
      [updatedBy || null]
    );
  }

  async updateById(id, fields) {
    const allowed = [
      'academic_year',
      'year_short',
      'opens_at',
      'closes_at',
      'student_submission_deadline',
      'institution_approval_deadline',
      'notes',
      'updated_by',
      'registration_fee_amount',
      'registration_fee_currency',
      'candidate_info_cutoff_at',
      'profile_update_cutoff_at',
      'ca_cutoff_at',
      'max_ca_score',
      'affiliation_fee_existing',
      'affiliation_fee_new',
      'exam_fee_per_candidate',
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        values.push(fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_registration_sessions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setStatus(id, status, updatedBy) {
    const result = await pool.query(
      `UPDATE jupeb_registration_sessions
       SET status = $2, updated_at = CURRENT_TIMESTAMP, updated_by = $3
       WHERE id = $1
       RETURNING *`,
      [id, status, updatedBy || null]
    );
    return result.rows[0];
  }

  async setFinalNumbersGeneratedAt(id, updatedBy) {
    const result = await pool.query(
      `UPDATE jupeb_registration_sessions
       SET final_numbers_generated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $2
       WHERE id = $1
       RETURNING *`,
      [id, updatedBy || null]
    );
    return result.rows[0];
  }

  async insertEvent(sessionId, eventType, payload, createdBy) {
    await pool.query(
      `INSERT INTO jupeb_session_events (session_id, event_type, payload, created_by)
       VALUES ($1, $2, $3::jsonb, $4)`,
      [sessionId, eventType, JSON.stringify(payload || {}), createdBy || null]
    );
  }
}

module.exports = new SessionModel();
