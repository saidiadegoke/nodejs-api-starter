const pool = require('../../../db/pool');

class SubjectCombinationModel {
  async create({ code, title, is_global = true, university_id = null }) {
    const result = await pool.query(
      `INSERT INTO jupeb_subject_combinations (code, title, is_global, university_id)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [code.trim(), title.trim(), is_global, university_id]
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

  async listItems(combinationId) {
    const r = await pool.query(
      `SELECT i.id, i.position, i.subject_id, s.code, s.name
       FROM jupeb_subject_combination_items i
       JOIN jupeb_subjects s ON s.id = i.subject_id
       WHERE i.combination_id = $1
       ORDER BY i.position ASC`,
      [combinationId]
    );
    return r.rows;
  }

  async replaceItems(combinationId, subjectIdsInOrder) {
    await pool.query(`DELETE FROM jupeb_subject_combination_items WHERE combination_id = $1`, [combinationId]);
    for (let i = 0; i < subjectIdsInOrder.length; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      await pool.query(
        `INSERT INTO jupeb_subject_combination_items (combination_id, subject_id, position)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING`,
        [combinationId, subjectIdsInOrder[i], i]
      );
    }
  }

  async findByCode(code) {
    const result = await pool.query(
      `SELECT * FROM jupeb_subject_combinations WHERE LOWER(code) = LOWER($1) AND deleted_at IS NULL`,
      [String(code).trim()]
    );
    return result.rows[0];
  }

  async findPublicActive({ universityId }) {
    if (universityId) {
      const result = await pool.query(
        `SELECT id, code, title, status, is_global, university_id, created_at, updated_at
         FROM jupeb_subject_combinations
         WHERE deleted_at IS NULL AND status = 'active'
           AND (is_global = true OR university_id = $1)
         ORDER BY title ASC`,
        [universityId]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT id, code, title, status, is_global, university_id, created_at, updated_at
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
    const allowed = ['title', 'is_global', 'university_id', 'code'];
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
