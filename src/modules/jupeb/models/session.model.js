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

  async setRegistrationLocked(id, locked, updatedBy) {
    const result = await pool.query(
      `UPDATE jupeb_registration_sessions
       SET registration_locked = $2,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = $3
       WHERE id = $1
       RETURNING *`,
      [id, Boolean(locked), updatedBy || null]
    );
    return result.rows[0];
  }

  async isUniversityRegistrationLocked(sessionId, universityId) {
    if (!sessionId || !universityId) return false;
    const result = await pool.query(
      `SELECT locked FROM jupeb_session_university_locks
       WHERE session_id = $1 AND university_id = $2`,
      [sessionId, universityId]
    );
    if (!result.rows.length) return false;
    return Boolean(result.rows[0].locked);
  }

  async setUniversityRegistrationLocks(sessionId, { universityIds, locked, reason, userId }) {
    const isLocked = Boolean(locked);
    const updatedRows = [];
    for (const universityId of universityIds) {
      const result = await pool.query(
        `INSERT INTO jupeb_session_university_locks (
           session_id, university_id, locked, reason, locked_at, locked_by, updated_at, updated_by
         ) VALUES (
           $1, $2, $3, $4,
           CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END,
           CASE WHEN $3 THEN $5::uuid ELSE NULL END,
           CURRENT_TIMESTAMP, $5
         )
         ON CONFLICT (session_id, university_id)
         DO UPDATE SET
           locked = EXCLUDED.locked,
           reason = CASE WHEN EXCLUDED.locked THEN EXCLUDED.reason ELSE jupeb_session_university_locks.reason END,
           locked_at = CASE WHEN EXCLUDED.locked THEN CURRENT_TIMESTAMP ELSE jupeb_session_university_locks.locked_at END,
           locked_by = CASE WHEN EXCLUDED.locked THEN EXCLUDED.locked_by ELSE jupeb_session_university_locks.locked_by END,
           updated_at = CURRENT_TIMESTAMP,
           updated_by = EXCLUDED.updated_by
         RETURNING *`,
        [sessionId, universityId, isLocked, reason || null, userId || null]
      );
      updatedRows.push(result.rows[0]);
    }
    return updatedRows;
  }

  async getUniversityRegistrationLocks(sessionId, { page = 1, limit = 50, q, locked } = {}) {
    const parsedPage = Math.max(1, parseInt(page, 10) || 1);
    const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (parsedPage - 1) * parsedLimit;

    const values = [sessionId];
    const where = ['u.deleted_at IS NULL'];
    let idx = 2;

    if (locked !== undefined && locked !== null && locked !== '') {
      const isLocked = locked === 'true' || locked === true || locked === 1 || locked === '1';
      if (isLocked) {
        where.push(`l.locked = true`);
      } else {
        where.push(`(l.locked IS NULL OR l.locked = false)`);
      }
    }

    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where.push(`(
        u.name ILIKE $${idx} OR
        u.code ILIKE $${idx} OR
        u.short_name ILIKE $${idx}
      )`);
      values.push(term);
      idx += 1;
    }

    const whereSql = where.join(' AND ');

    const countSql = `
      SELECT COUNT(*)::int AS total
      FROM jupeb_universities u
      LEFT JOIN jupeb_session_university_locks l
        ON l.university_id = u.id AND l.session_id = $1
      WHERE ${whereSql}
    `;
    const countResult = await pool.query(countSql, values);
    const total = countResult.rows[0]?.total || 0;

    values.push(parsedLimit, offset);
    const dataSql = `
      SELECT
        u.id AS university_id,
        u.name AS university_name,
        u.code AS university_code,
        u.short_name AS university_short_name,
        COALESCE(l.locked, false) AS locked,
        l.reason,
        l.locked_at,
        l.locked_by,
        l.updated_at,
        l.updated_by,
        NULLIF(TRIM(CONCAT_WS(' ', up.first_name, up.last_name)), '') AS locked_by_name,
        up.display_name AS locked_by_display_name,
        u_user.email AS locked_by_email
      FROM jupeb_universities u
      LEFT JOIN jupeb_session_university_locks l
        ON l.university_id = u.id AND l.session_id = $1
      LEFT JOIN profiles up
        ON up.user_id = l.locked_by
      LEFT JOIN users u_user
        ON u_user.id = l.locked_by
      WHERE ${whereSql}
      ORDER BY COALESCE(l.locked, false) DESC, u.name ASC
      LIMIT $${idx} OFFSET $${idx + 1}
    `;

    const dataResult = await pool.query(dataSql, values);
    return {
      rows: dataResult.rows,
      total,
      page: parsedPage,
      limit: parsedLimit,
    };
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
