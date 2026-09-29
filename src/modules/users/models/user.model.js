const pool = require('../../../db/pool');

class UserModel {
  static async findById(id) {
    const result = await pool.query(
      `SELECT u.*, p.first_name, p.last_name, p.display_name, p.profile_photo_url,
              p.bio, p.date_of_birth, p.gender, p.address, p.position, p.professional_title,
              p.country_id, p.state_id, p.city_id
         FROM users u
         LEFT JOIN profiles p ON u.id = p.user_id
        WHERE u.id = $1 AND u.deleted_at IS NULL`,
      [id]
    );
    return result.rows[0];
  }

  static async findByEmail(email) {
    const result = await pool.query(
      `SELECT * FROM users WHERE LOWER(email) = LOWER($1) AND deleted_at IS NULL`,
      [email]
    );
    return result.rows[0];
  }

  static async findByPhone(phone) {
    const result = await pool.query(
      `SELECT * FROM users WHERE phone = $1 AND deleted_at IS NULL`,
      [phone]
    );
    return result.rows[0];
  }

  static async find(options = {}) {
    const { page = 1, limit = 20, search = '', role, status, sortBy = 'created_at', sortOrder = 'DESC' } = options;
    const offset = (page - 1) * limit;
    const conditions = ['u.deleted_at IS NULL'];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(
        u.email ILIKE $${idx} OR 
        u.phone ILIKE $${idx} OR 
        p.first_name ILIKE $${idx} OR 
        p.last_name ILIKE $${idx} OR 
        p.display_name ILIKE $${idx}
      )`);
      values.push(`%${search}%`);
      idx++;
    }

    if (status) {
      conditions.push(`u.status = $${idx}`);
      values.push(status);
      idx++;
    }

    if (role) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id AND r.name = $${idx}
      )`);
      values.push(role);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const safeSort = ['created_at', 'email', 'status'].includes(sortBy) ? sortBy : 'created_at';
    const safeOrder = sortOrder.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const sql = `
      SELECT u.id, u.email, u.phone, u.status, u.email_verified, u.phone_verified,
             u.created_at, u.updated_at, u.last_login_at,
             p.first_name, p.last_name, p.display_name, p.profile_photo_url,
             p.position, p.professional_title,
             COALESCE(
               json_agg(DISTINCT jsonb_build_object('id', r.id, 'name', r.name, 'display_name', r.display_name))
               FILTER (WHERE r.id IS NOT NULL), '[]'
             ) as roles
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ${whereClause}
      GROUP BY u.id, p.id
      ORDER BY u.${safeSort} ${safeOrder}
      LIMIT $${idx} OFFSET $${idx + 1}
    `;
    values.push(limit, offset);

    const result = await pool.query(sql, values);
    return result.rows;
  }

  static async count(options = {}) {
    const { search = '', role, status } = options;
    const conditions = ['u.deleted_at IS NULL'];
    const values = [];
    let idx = 1;

    if (search) {
      conditions.push(`(
        u.email ILIKE $${idx} OR 
        u.phone ILIKE $${idx} OR 
        p.first_name ILIKE $${idx} OR 
        p.last_name ILIKE $${idx} OR 
        p.display_name ILIKE $${idx}
      )`);
      values.push(`%${search}%`);
      idx++;
    }

    if (status) {
      conditions.push(`u.status = $${idx}`);
      values.push(status);
      idx++;
    }

    if (role) {
      conditions.push(`EXISTS (
        SELECT 1 FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = u.id AND r.name = $${idx}
      )`);
      values.push(role);
      idx++;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `
      SELECT COUNT(DISTINCT u.id)::int as total
      FROM users u
      LEFT JOIN profiles p ON u.id = p.user_id
      ${whereClause}
    `;

    const result = await pool.query(sql, values);
    return result.rows[0].total;
  }

  static async update(id, data) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { email, phone, status, first_name, last_name, display_name, position, professional_title } = data;

      if (email !== undefined || phone !== undefined || status !== undefined) {
        const userUpdates = [];
        const userValues = [id];
        let idx = 2;
        if (email !== undefined) { userUpdates.push(`email = $${idx++}`); userValues.push(email); }
        if (phone !== undefined) { userUpdates.push(`phone = $${idx++}`); userValues.push(phone); }
        if (status !== undefined) { userUpdates.push(`status = $${idx++}`); userValues.push(status); }
        userUpdates.push(`updated_at = NOW()`);

        await client.query(
          `UPDATE users SET ${userUpdates.join(', ')} WHERE id = $1`,
          userValues
        );
      }

      if (first_name !== undefined || last_name !== undefined || display_name !== undefined || position !== undefined || professional_title !== undefined) {
        const profileUpdates = [];
        const profileValues = [id];
        let idx = 2;
        if (first_name !== undefined) { profileUpdates.push(`first_name = $${idx++}`); profileValues.push(first_name); }
        if (last_name !== undefined) { profileUpdates.push(`last_name = $${idx++}`); profileValues.push(last_name); }
        if (display_name !== undefined) { profileUpdates.push(`display_name = $${idx++}`); profileValues.push(display_name); }
        if (position !== undefined) { profileUpdates.push(`position = $${idx++}`); profileValues.push(position); }
        if (professional_title !== undefined) { profileUpdates.push(`professional_title = $${idx++}`); profileValues.push(professional_title); }
        profileUpdates.push(`updated_at = NOW()`);

        await client.query(
          `UPDATE profiles SET ${profileUpdates.join(', ')} WHERE user_id = $1`,
          profileValues
        );
      }

      await client.query('COMMIT');
      return await UserModel.findById(id);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  static async delete(id) {
    await pool.query(
      `UPDATE users SET deleted_at = NOW(), status = 'deleted', updated_at = NOW() WHERE id = $1`,
      [id]
    );
    return true;
  }
}

module.exports = UserModel;
