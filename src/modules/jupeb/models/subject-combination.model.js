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

  /** Batch fetch combinations by id (active only). */
  async findByIds(ids) {
    if (!ids || !ids.length) return [];
    const r = await pool.query(
      `SELECT * FROM jupeb_subject_combinations
       WHERE id = ANY($1::uuid[]) AND deleted_at IS NULL`,
      [ids]
    );
    return r.rows;
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

  /**
   * Batch variant of listItems — fetches the ordered subject items for
   * many combinations in one query. Returns a Map<combinationId, items[]>.
   * Avoids the N+1 of calling listItems per row when embedding into a list.
   */
  async listItemsForCombinations(combinationIds) {
    const map = new Map();
    if (!combinationIds || !combinationIds.length) return map;
    const r = await pool.query(
      `SELECT i.combination_id, i.id, i.position, i.subject_id, s.code, s.name
       FROM jupeb_subject_combination_items i
       JOIN jupeb_subjects s ON s.id = i.subject_id
       WHERE i.combination_id = ANY($1::uuid[])
       ORDER BY i.combination_id, i.position ASC`,
      [combinationIds]
    );
    for (const row of r.rows) {
      if (!map.has(row.combination_id)) map.set(row.combination_id, []);
      map.get(row.combination_id).push({
        id: row.id,
        position: row.position,
        subject_id: row.subject_id,
        code: row.code,
        name: row.name,
      });
    }
    return map;
  }

  /**
   * Non-withdrawn registration counts ("candidates enrolled") for many
   * combinations in one query. Returns a Map<combinationId, count>.
   *
   * Counts candidates offering the exact subjects (e.g. standard three subjects)
   * in that subject combination, properly matching across combinations that share
   * the same set of subjects.
   */
  async enrolledCountsForCombinations(combinationIds, { sessionId = null, universityId = null } = {}) {
    const map = new Map();
    if (!combinationIds || !combinationIds.length) return map;
    const uniqueIds = Array.from(new Set(combinationIds));
    for (const id of uniqueIds) map.set(id, 0);

    const conditions = ["r.status <> 'withdrawn'"];
    const params = [uniqueIds];
    let pIdx = 2;
    if (sessionId) {
      conditions.push(`r.session_id = $${pIdx++}`);
      params.push(sessionId);
    }
    if (universityId) {
      conditions.push(`r.university_id = $${pIdx++}`);
      params.push(universityId);
    }

    const query = `
      WITH combo_subjects AS (
        SELECT
          combination_id,
          ARRAY_AGG(subject_id ORDER BY subject_id) AS subject_ids,
          COUNT(subject_id)::int AS subject_count
        FROM jupeb_subject_combination_items
        GROUP BY combination_id
      ),
      reg_combo_counts AS (
        SELECT
          cs.subject_ids,
          COUNT(DISTINCT r.id)::int AS candidate_count
        FROM jupeb_registrations r
        JOIN combo_subjects cs ON cs.combination_id = r.subject_combination_id
        WHERE ${conditions.join(' AND ')}
        GROUP BY cs.subject_ids
      )
      SELECT
        target_ids.id AS combination_id,
        COALESCE(rcc.candidate_count, 0)::int AS enrolled_count
      FROM UNNEST($1::uuid[]) AS target_ids(id)
      LEFT JOIN combo_subjects cs ON cs.combination_id = target_ids.id
      LEFT JOIN reg_combo_counts rcc
        ON cs.subject_ids = rcc.subject_ids AND cs.subject_ids IS NOT NULL
    `;

    const r = await pool.query(query, params);
    for (const row of r.rows) {
      map.set(row.combination_id, row.enrolled_count);
    }
    return map;
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
         ORDER BY code ASC, title ASC`,
        [universityId]
      );
      return result.rows;
    }
    const result = await pool.query(
      `SELECT id, code, title, status, is_global, university_id, created_at, updated_at
       FROM jupeb_subject_combinations
       WHERE deleted_at IS NULL AND status = 'active' AND is_global = true
       ORDER BY code ASC, title ASC`
    );
    return result.rows;
  }

  _whereAdmin({ status, university_id, q }) {
    const values = [];
    const where = ['deleted_at IS NULL'];
    let idx = 1;
    if (status) {
      where.push(`status = $${idx++}`);
      values.push(status);
    }
    if (university_id) {
      where.push(`(is_global = true OR university_id = $${idx++})`);
      values.push(university_id);
    }
    if (q && String(q).trim()) {
      const term = `%${String(q).trim()}%`;
      where.push(`(
        code ILIKE $${idx} OR
        title ILIKE $${idx}
      )`);
      values.push(term);
      idx += 1;
    }
    return { whereSql: where.join(' AND '), values, nextIdx: idx };
  }

  async findAllAdmin({ limit, offset, status, university_id, q, sortBy = 'code', sortOrder = 'ASC' }) {
    const { whereSql, values, nextIdx } = this._whereAdmin({ status, university_id, q });
    values.push(limit, offset);
    const orderDir = String(sortOrder).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';
    let orderBySql = 'code ASC, title ASC';
    if (sortBy === 'title') {
      orderBySql = `title ${orderDir}, code ASC`;
    } else if (sortBy === 'created_at') {
      orderBySql = `created_at ${orderDir}`;
    } else {
      orderBySql = `code ${orderDir}, title ASC`;
    }
    const sql = `SELECT * FROM jupeb_subject_combinations WHERE ${whereSql}
                 ORDER BY ${orderBySql} LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const result = await pool.query(sql, values);
    return result.rows;
  }

  async countAdmin({ status, university_id, q }) {
    const { whereSql, values } = this._whereAdmin({ status, university_id, q });
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM jupeb_subject_combinations WHERE ${whereSql}`,
      values
    );
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

  async softDelete(id) {
    const result = await pool.query(
      `UPDATE jupeb_subject_combinations SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
      [id]
    );
    return result.rows[0] || null;
  }
}

module.exports = new SubjectCombinationModel();
