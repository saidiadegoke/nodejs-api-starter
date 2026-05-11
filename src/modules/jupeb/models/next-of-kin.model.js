const pool = require('../../../db/pool');

class NextOfKinModel {
  async findActiveByRegistration(registrationId, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_next_of_kin
       WHERE registration_id = $1 AND deleted_at IS NULL
       LIMIT 1`,
      [registrationId]
    );
    return result.rows[0] || null;
  }

  async findById(id, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_next_of_kin WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async listHistoryByRegistration(registrationId, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_next_of_kin
       WHERE registration_id = $1
       ORDER BY created_at DESC`,
      [registrationId]
    );
    return result.rows;
  }

  async create({ registration_id, name, relationship, phone, email, address, source, created_by }, client = pool) {
    const result = await client.query(
      `INSERT INTO jupeb_next_of_kin
         (registration_id, name, relationship, phone, email, address, source, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        registration_id,
        name,
        relationship,
        phone || null,
        email || null,
        address || null,
        source || 'student',
        created_by || null
      ]
    );
    return result.rows[0];
  }

  async softDelete(id, client = pool) {
    const result = await client.query(
      `UPDATE jupeb_next_of_kin
         SET deleted_at = NOW(), updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL
       RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Replace the active NoK in a single transaction:
   *  - soft-deletes any active row
   *  - inserts a new active row
   * Caller may pass an open transactional client.
   */
  async softReplaceActive(registrationId, payload, client = null) {
    const ownClient = !client;
    const conn = client || (await pool.connect());
    try {
      if (ownClient) await conn.query('BEGIN');
      const existing = await conn.query(
        `SELECT id FROM jupeb_next_of_kin
          WHERE registration_id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [registrationId]
      );
      if (existing.rows[0]) {
        await conn.query(
          `UPDATE jupeb_next_of_kin
             SET deleted_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [existing.rows[0].id]
        );
      }
      const inserted = await this.create(
        { registration_id: registrationId, ...payload },
        conn
      );
      if (ownClient) await conn.query('COMMIT');
      return inserted;
    } catch (err) {
      if (ownClient) {
        try { await conn.query('ROLLBACK'); } catch { /* ignore */ }
      }
      throw err;
    } finally {
      if (ownClient) conn.release();
    }
  }
}

module.exports = new NextOfKinModel();
