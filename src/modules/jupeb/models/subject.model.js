const pool = require('../../../database/pool');
const { getActiveStudentStatusCondition } = require('../utils/student-count');

class SubjectModel {
  async create({ code, name, description = null, status = 'active' }) {
    const result = await pool.query(
      `INSERT INTO jupeb_subjects (code, name, description, status)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code.trim(), name.trim(), description ? String(description).trim() : null, status]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM jupeb_subjects WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  async findByCode(code) {
    const result = await pool.query(
      `SELECT * FROM jupeb_subjects WHERE LOWER(code) = LOWER($1) AND deleted_at IS NULL`,
      [String(code).trim()]
    );
    return result.rows[0];
  }

  async findPublicActive() {
    const result = await pool.query(
      `SELECT id, code, name, description, status, created_at, updated_at
       FROM jupeb_subjects
       WHERE deleted_at IS NULL AND status = 'active'
       ORDER BY name ASC`
    );
    return result.rows;
  }

  _whereAdmin({ status, q }) {
    const values = [];
    const where = ['deleted_at IS NULL'];
    let i = 1;
    if (status) {
      where.push(`status = $${i++}`);
      values.push(status);
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where.push(`(
        code ILIKE $${i} OR
        name ILIKE $${i} OR
        COALESCE(description, '') ILIKE $${i}
      )`);
      values.push(term);
      i += 1;
    }
    return { whereSql: where.join(' AND '), values, nextIdx: i };
  }

  async findAllAdmin({ limit, offset, status, q }) {
    const { whereSql, values, nextIdx } = this._whereAdmin({ status, q });
    values.push(limit, offset);
    const sql = `SELECT * FROM jupeb_subjects WHERE ${whereSql}
                 ORDER BY name ASC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async countAdmin({ status, q }) {
    const { whereSql, values } = this._whereAdmin({ status, q });
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_subjects WHERE ${whereSql}`,
      values
    );
    return result.rows[0].c;
  }

  /**
   * Non-withdrawn registration counts for one session ("candidates enrolled")
   * for many subjects in one query. A registration counts toward every
   * subject in its combination. Returns a Map<subjectId, count>.
   */
  async enrolledCountsForSubjects(subjectIds, sessionId) {
    const map = new Map();
    if (!subjectIds || !subjectIds.length || !sessionId) return map;
    const result = await pool.query(
      `SELECT i.subject_id, COUNT(DISTINCT r.id)::int AS c
       FROM jupeb_subject_combination_items i
       JOIN jupeb_registrations r ON r.subject_combination_id = i.combination_id
       WHERE i.subject_id = ANY($1::uuid[])
         AND ${getActiveStudentStatusCondition('r')}
         AND r.session_id = $2
       GROUP BY i.subject_id`,
      [subjectIds, sessionId]
    );
    for (const row of result.rows) map.set(row.subject_id, row.c);
    return map;
  }

  async updateById(id, fields) {
    const allowed = ['name', 'code', 'description'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = $${i++}`);
        values.push(typeof fields[key] === 'string' ? fields[key].trim() : fields[key]);
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_subjects SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setStatus(id, status) {
    const result = await pool.query(
      `UPDATE jupeb_subjects SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  }

  async softDelete(id) {
    const result = await pool.query(
      `UPDATE jupeb_subjects SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = new SubjectModel();
