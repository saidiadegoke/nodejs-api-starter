const pool = require('../../../db/pool');

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

  async findAllAdmin({ limit, offset, status }) {
    const values = [];
    let i = 1;
    let q = `SELECT * FROM jupeb_subjects WHERE deleted_at IS NULL`;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    q += ` ORDER BY name ASC LIMIT $${i} OFFSET $${i + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async countAdmin({ status }) {
    const values = [];
    let i = 1;
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_subjects WHERE deleted_at IS NULL`;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
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
}

module.exports = new SubjectModel();
