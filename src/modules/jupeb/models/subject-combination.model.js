const pool = require('../../../db/pool');

class SubjectCombinationModel {
  async create({ code, title, subjects, is_global = true, university_id = null }) {
    const result = await pool.query(
      `INSERT INTO jupeb_subject_combinations (code, title, subjects, is_global, university_id)
       VALUES ($1, $2, $3::jsonb, $4, $5)
       RETURNING *`,
      [code.trim(), title.trim(), JSON.stringify(subjects), is_global, university_id]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM jupeb_subject_combinations WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  async findPublicActive({ universityId }) {
    if (universityId) {
      const result = await pool.query(
        `SELECT id, code, title, subjects, status, is_global, university_id, created_at, updated_at
         FROM jupeb_subject_combinations
         WHERE deleted_at IS NULL AND status = 'active'
           AND (is_global = true OR university_id = $1)
         ORDER BY title ASC`,
        [universityId]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT id, code, title, subjects, status, is_global, university_id, created_at, updated_at
       FROM jupeb_subject_combinations
       WHERE deleted_at IS NULL AND status = 'active' AND is_global = true
       ORDER BY title ASC`
    );
    return result.rows;
  }

  async findAllAdmin({ limit, offset, status, university_id }) {
    const values = [];
    let idx = 1;
    let q = `SELECT * FROM jupeb_subject_combinations WHERE deleted_at IS NULL`;
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (university_id) {
      q += ` AND (is_global = true OR university_id = $${idx++})`;
      values.push(university_id);
    }
    q += ` ORDER BY title ASC LIMIT $${idx} OFFSET $${idx + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async countAdmin({ status, university_id }) {
    const values = [];
    let idx = 1;
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_subject_combinations WHERE deleted_at IS NULL`;
    if (status) {
      q += ` AND status = $${idx++}`;
      values.push(status);
    }
    if (university_id) {
      q += ` AND (is_global = true OR university_id = $${idx++})`;
      values.push(university_id);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
  }

  async updateById(id, fields) {
    const allowed = ['title', 'subjects', 'is_global', 'university_id', 'code'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        if (key === 'subjects') {
          sets.push(`subjects = $${i++}::jsonb`);
          values.push(JSON.stringify(fields[key]));
        } else {
          sets.push(`${key} = $${i++}`);
          values.push(fields[key]);
        }
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_subject_combinations SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setStatus(id, status) {
    const result = await pool.query(
      `UPDATE jupeb_subject_combinations SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  }
}

module.exports = new SubjectCombinationModel();
