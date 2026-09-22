const pool = require('../../../db/pool');
const { normalizeStatus } = require('../../../shared/utils/status');

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

  async findByJupebPrefix(prefix) {
    if (!prefix) return null;
    const clean = String(prefix).trim().replace(/^['’`"]+/, '').trim();
    const result = await pool.query(
      `SELECT * FROM jupeb_universities WHERE jupeb_prefix = $1 AND deleted_at IS NULL LIMIT 1`,
      [clean]
    );
    return result.rows[0] || null;
  }

  /**
   * Resolve the university a user belongs to — the institution-scope
   * binding on profiles.jupeb_university_id, falling back to the
   * university of their latest JUPEB registration (covers students who
   * have no profile binding). Returns { id, name, short_name,
   * jupeb_prefix, status, expected_candidate_count } or null.
   */
  async resolveForUser(userId) {
    const result = await pool.query(
      `SELECT u.id, u.code, u.name, u.short_name, u.jupeb_prefix, u.status,
              u.expected_candidate_count
         FROM jupeb_universities u
        WHERE u.deleted_at IS NULL
          AND u.id = COALESCE(
            (SELECT jupeb_university_id FROM profiles WHERE user_id = $1),
            (SELECT university_id FROM jupeb_registrations
              WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)
          )
        LIMIT 1`,
      [userId]
    );
    return result.rows[0] || null;
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

  // Shared WHERE-builder so list + count stay in lock-step. `q` is a
  // case-insensitive substring match across the catalog's searchable
  // text columns — code (e.g. "UNILAG"), name, short_name.
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
        COALESCE(short_name, '') ILIKE $${i}
      )`);
      values.push(term);
      i += 1;
    }
    return { whereSql: where.join(' AND '), values, nextIdx: i };
  }

  async findAllAdmin({ limit, offset, status, q }) {
    const { whereSql, values, nextIdx } = this._whereAdmin({ status, q });
    values.push(limit, offset);
    const sql = `SELECT * FROM jupeb_universities WHERE ${whereSql}
                 ORDER BY name ASC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async countAdmin({ status, q }) {
    const { whereSql, values } = this._whereAdmin({ status, q });
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_universities WHERE ${whereSql}`,
      values
    );
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
      'status',
    ];
    if (fields.status !== undefined) {
      const norm = normalizeStatus(fields.status);
      if (norm) fields.status = norm;
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const currentResult = await client.query(
        `SELECT email
           FROM jupeb_universities
          WHERE id = $1 AND deleted_at IS NULL
          FOR UPDATE`,
        [id]
      );
      const current = currentResult.rows[0];
      if (!current) {
        await client.query('ROLLBACK');
        return undefined;
      }

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
      if (!sets.length) {
        await client.query('COMMIT');
        return this.findById(id);
      }

      sets.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);
      const result = await client.query(
        `UPDATE jupeb_universities
            SET ${sets.join(', ')}
          WHERE id = $${i} AND deleted_at IS NULL
          RETURNING *`,
        values
      );

      // Keep the institution_admin login account in sync with institution
      // contact fields. Prefer the admin whose email still matches the
      // previous institution email; otherwise use the primary / oldest
      // institution_admin bound to this university (covers already-drifted
      // emails and missing user_universities.role values).
      if (fields.email !== undefined || fields.phone !== undefined) {
        const userSets = [];
        const userValues = [];
        let userIdx = 1;
        if (fields.email !== undefined) {
          userSets.push(`email = $${userIdx++}`);
          userValues.push(String(fields.email).trim().toLowerCase());
        }
        if (fields.phone !== undefined) {
          userSets.push(`phone = $${userIdx++}`);
          userValues.push(
            typeof fields.phone === 'string' ? fields.phone.trim() || null : fields.phone
          );
        }
        userSets.push('updated_at = CURRENT_TIMESTAMP');
        const previousEmailIdx = userIdx;
        userValues.push(current.email || null);
        userIdx += 1;
        const universityIdIdx = userIdx;
        userValues.push(id);

        const syncResult = await client.query(
          `UPDATE users u
              SET ${userSets.join(', ')}
            WHERE u.id = (
              SELECT candidate.id
                FROM (
                  SELECT usr.id,
                         usr.created_at,
                         COALESCE(uu.is_primary, false) AS is_primary,
                         CASE
                           WHEN $${previousEmailIdx}::text IS NOT NULL
                            AND LOWER(usr.email) = LOWER($${previousEmailIdx})
                           THEN 0 ELSE 1
                         END AS email_rank
                    FROM users usr
                    LEFT JOIN user_universities uu
                      ON uu.user_id = usr.id
                     AND uu.university_id = $${universityIdIdx}
                     AND uu.deleted_at IS NULL
                    LEFT JOIN profiles p ON p.user_id = usr.id
                   WHERE usr.deleted_at IS NULL
                     AND (
                       uu.role = 'institution_admin'
                       OR (
                         p.jupeb_university_id = $${universityIdIdx}
                         AND EXISTS (
                           SELECT 1
                             FROM user_roles ur
                             JOIN roles r ON r.id = ur.role_id
                            WHERE ur.user_id = usr.id
                              AND r.name = 'institution_admin'
                              AND r.owner_jupeb_university_id IS NULL
                              AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
                         )
                       )
                     )
                 ) candidate
               ORDER BY candidate.email_rank ASC,
                        CASE WHEN candidate.is_primary THEN 0 ELSE 1 END ASC,
                        candidate.created_at ASC
               LIMIT 1
            )
            RETURNING u.id, u.email, u.phone`,
          userValues
        );

        if (!syncResult.rowCount && fields.email !== undefined) {
          // eslint-disable-next-line no-console
          console.warn(
            `[university.updateById] No institution_admin user found to sync email for university ${id}`
          );
        }
      }

      await client.query('COMMIT');
      return result.rows[0];
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw err;
    } finally {
      client.release();
    }
  }

  async setStatus(id, status) {
    const result = await pool.query(
      `UPDATE jupeb_universities SET status = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id, status]
    );
    return result.rows[0];
  }

  async softDelete(id) {
    const result = await pool.query(
      `UPDATE jupeb_universities SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Non-withdrawn registration counts per university for a session.
   * @returns {Promise<Map<string, number>>}
   */
  async enrolledCountsForUniversities(universityIds, sessionId) {
    const map = new Map();
    if (!universityIds || !universityIds.length || !sessionId) return map;
    const result = await pool.query(
      `SELECT university_id, COUNT(*)::int AS c
       FROM jupeb_registrations
       WHERE university_id = ANY($1::uuid[])
         AND session_id = $2
         AND status <> 'withdrawn'
       GROUP BY university_id`,
      [universityIds, sessionId]
    );
    for (const row of result.rows) map.set(row.university_id, row.c);
    return map;
  }
}

module.exports = new UniversityModel();
