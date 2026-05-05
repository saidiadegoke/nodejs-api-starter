const pool = require('../../../db/pool');

class CourseModel {
  async create({ code, title, status = 'active' }) {
    const result = await pool.query(
      `INSERT INTO jupeb_courses (code, title, status) VALUES ($1, $2, $3) RETURNING *`,
      [String(code).trim(), String(title).trim(), status]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query(`SELECT * FROM jupeb_courses WHERE id = $1`, [id]);
    return result.rows[0] || null;
  }

  async findByCode(code) {
    const result = await pool.query(`SELECT * FROM jupeb_courses WHERE code = $1`, [String(code).trim()]);
    return result.rows[0] || null;
  }

  async listActive() {
    const result = await pool.query(
      `SELECT id, code, title, status, created_at, updated_at FROM jupeb_courses WHERE status = 'active' ORDER BY code ASC`
    );
    return result.rows;
  }
}

module.exports = new CourseModel();
