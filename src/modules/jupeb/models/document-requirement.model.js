const pool = require('../../../db/pool');

class DocumentRequirementModel {
  async create(data) {
    const { key, title, description, is_mandatory, allowed_mime_types, max_file_size_mb, status } = data;
    const result = await pool.query(
      `INSERT INTO jupeb_document_requirements (
        key, title, description, is_mandatory, allowed_mime_types, max_file_size_mb, status
      ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, COALESCE($7, 'active'))
      RETURNING *`,
      [
        String(key).trim(),
        String(title).trim(),
        description || null,
        is_mandatory !== false,
        JSON.stringify(allowed_mime_types || []),
        max_file_size_mb != null ? Number(max_file_size_mb) : 10,
        status || 'active',
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(`SELECT * FROM jupeb_document_requirements WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async findByKey(key) {
    const result = await pool.query(
      `SELECT * FROM jupeb_document_requirements WHERE LOWER(key) = LOWER($1)`,
      [String(key).trim()]
    );
    return result.rows[0] || null;
  }

  async findAll({ limit, offset, status }) {
    const values = [];
    let i = 1;
    let q = `SELECT * FROM jupeb_document_requirements WHERE 1=1`;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    q += ` ORDER BY key ASC LIMIT $${i} OFFSET $${i + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async count({ status }) {
    const values = [];
    let i = 1;
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_document_requirements WHERE 1=1`;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
  }

  async updateById(id, fields) {
    const allowed = ['title', 'description', 'is_mandatory', 'allowed_mime_types', 'max_file_size_mb', 'status'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        if (k === 'allowed_mime_types') {
          sets.push(`allowed_mime_types = $${idx++}::jsonb`);
          values.push(JSON.stringify(fields[k]));
        } else {
          sets.push(`${k} = $${idx++}`);
          values.push(fields[k]);
        }
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_document_requirements SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async findActiveForCompleteness() {
    const result = await pool.query(
      `SELECT * FROM jupeb_document_requirements WHERE status = 'active' ORDER BY is_mandatory DESC, key ASC`
    );
    return result.rows;
  }
}

module.exports = new DocumentRequirementModel();
