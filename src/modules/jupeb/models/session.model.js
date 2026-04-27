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
    } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_registration_sessions (
        academic_year, year_short, opens_at, closes_at,
        student_submission_deadline, institution_approval_deadline, notes, created_by, updated_by,
        registration_fee_amount, registration_fee_currency
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, COALESCE($10, 'NGN'))
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

  async findAll({ limit, offset, status }) {
    const values = [];
    let idx = 1;
    let q = `SELECT * FROM jupeb_registration_sessions WHERE 1=1`;
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    q += ` ORDER BY opens_at DESC LIMIT $${idx} OFFSET $${idx + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async count({ status }) {
    const values = [];
    let idx = 1;
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_registration_sessions WHERE 1=1`;
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
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
