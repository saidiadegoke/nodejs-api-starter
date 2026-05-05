const pool = require('../../../db/pool');

class UniversityModel {
  async create({
    code,
    name,
    short_name = null,
    jupeb_prefix,
    metadata = {},
    university_type = null,
    email = null,
    address = null,
    phone = null,
    expected_candidate_count = null,
    description = null,
  }) {
    const result = await pool.query(
      `INSERT INTO jupeb_universities (
         code, name, short_name, jupeb_prefix, metadata, university_type,
         email, address, phone, expected_candidate_count, description
       )
       VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        code.trim(),
        name.trim(),
        short_name ? short_name.trim() : null,
        jupeb_prefix,
        JSON.stringify(metadata),
        university_type,
        email,
        address,
        phone,
        expected_candidate_count,
        description,
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(
      `SELECT * FROM jupeb_universities WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  async findPublicActive({ universityType } = {}) {
    if (universityType) {
      const r = await pool.query(
        `SELECT id, code, name, short_name, jupeb_prefix, status, metadata, university_type, created_at, updated_at
         FROM jupeb_universities
         WHERE deleted_at IS NULL AND status = 'active' AND university_type = $1
         ORDER BY name ASC`,
        [universityType]
      );
      return r.rows;
    }
    const result = await pool.query(
      `SELECT id, code, name, short_name, jupeb_prefix, status, metadata, university_type, created_at, updated_at
       FROM jupeb_universities
       WHERE deleted_at IS NULL AND status = 'active'
       ORDER BY name ASC`
    );
    return result.rows;
  }

  async findAllAdmin({ limit, offset, status }) {
    const values = [];
    let i = 1;
    let q = `SELECT * FROM jupeb_universities WHERE deleted_at IS NULL`;
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
    let q = `SELECT COUNT(*)::int AS c FROM jupeb_universities WHERE deleted_at IS NULL`;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
    return result.rows[0].c;
  }

  async updateById(id, fields) {
    const allowed = [
      'name',
      'short_name',
      'metadata',
      'jupeb_prefix',
      'code',
      'university_type',
      'email',
      'address',
      'phone',
      'expected_candidate_count',
      'description',
    ];
    const sets = [];
    const values = [];
    let i = 1;
    for (const key of allowed) {
      if (fields[key] !== undefined) {
        if (key === 'metadata') {
          sets.push(`metadata = $${i++}::jsonb`);
          values.push(JSON.stringify(fields[key]));
        } else {
          sets.push(`${key} = $${i++}`);
          values.push(typeof fields[key] === 'string' ? fields[key].trim() : fields[key]);
        }
      }
    }
    if (!sets.length) return this.findById(id);
    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    const result = await pool.query(
      `UPDATE jupeb_universities SET ${sets.join(', ')} WHERE id = $${i} AND deleted_at IS NULL RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async setStatus(id, status) {
    const result = await pool.query(
      `UPDATE jupeb_universities SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  }
}

module.exports = new UniversityModel();
