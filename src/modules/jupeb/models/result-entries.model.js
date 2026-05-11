const pool = require('../../../db/pool');

class ResultEntriesModel {
  async findByRegistration(registrationId, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_result_entries
       WHERE registration_id = $1
       ORDER BY source ASC, sitting ASC, serial ASC`,
      [registrationId]
    );
    return result.rows;
  }

  async findByOcrJob(ocrJobId, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_result_entries WHERE ocr_job_id = $1 ORDER BY serial ASC`,
      [ocrJobId]
    );
    return result.rows;
  }

  async findById(id, client = pool) {
    const result = await client.query(
      `SELECT * FROM jupeb_result_entries WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  }

  async updateById(id, fields, client = pool) {
    const allowed = ['subject', 'grade', 'grade_normalized', 'score', 'origin'];
    const sets = [];
    const values = [];
    let idx = 1;
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        sets.push(`${k} = $${idx++}`);
        values.push(fields[k]);
      }
    }
    if (!sets.length) return this.findById(id, client);
    sets.push(`updated_at = NOW()`);
    values.push(id);
    const result = await client.query(
      `UPDATE jupeb_result_entries SET ${sets.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0] || null;
  }

  async deleteByOcrJob(ocrJobId, client = pool) {
    const result = await client.query(
      `DELETE FROM jupeb_result_entries WHERE ocr_job_id = $1 AND origin = 'ocr' RETURNING id`,
      [ocrJobId]
    );
    return result.rowCount;
  }

  async deleteByRegistrationSourceSitting(registrationId, source, sitting, { onlyOrigin } = {}, client = pool) {
    const params = [registrationId, source, sitting];
    let where = `registration_id = $1 AND source = $2 AND sitting = $3`;
    if (onlyOrigin) {
      params.push(onlyOrigin);
      where += ` AND origin = $${params.length}`;
    }
    const result = await client.query(
      `DELETE FROM jupeb_result_entries WHERE ${where} RETURNING id`,
      params
    );
    return result.rowCount;
  }

  /**
   * Bulk upsert by natural key (registration_id, source, sitting, serial).
   *
   * Conflict resolution rules:
   *   - Incoming `manual` row replaces an existing row (manual or OCR).
   *   - Incoming `ocr` row will NOT overwrite an existing manual row
   *     (the registrar's correction wins).
   *   - Otherwise, the incoming row wins.
   *
   * Returns the resulting set of rows for the (registration, source, sitting)
   * key. Caller may pass an open transactional client.
   */
  async bulkUpsert(rows, client = null) {
    if (!Array.isArray(rows) || rows.length === 0) return [];

    const ownClient = !client;
    const conn = client || (await pool.connect());
    try {
      if (ownClient) await conn.query('BEGIN');

      const results = [];
      for (const r of rows) {
        const {
          registration_id,
          source,
          sitting,
          serial,
          subject,
          grade,
          grade_normalized = null,
          score = null,
          origin = 'manual',
          ocr_job_id = null,
          created_by = null
        } = r;

        // Look up existing row at the same key
        const existing = await conn.query(
          `SELECT id, origin FROM jupeb_result_entries
           WHERE registration_id = $1 AND source = $2 AND sitting = $3 AND serial = $4
           FOR UPDATE`,
          [registration_id, source, sitting, serial]
        );
        const ex = existing.rows[0];

        if (ex && ex.origin === 'manual' && origin === 'ocr') {
          // Don't overwrite a manual correction with a fresh OCR pass.
          results.push(await this.findById(ex.id, conn));
          continue;
        }

        if (ex) {
          const upd = await conn.query(
            `UPDATE jupeb_result_entries
                SET subject = $2,
                    grade = $3,
                    grade_normalized = $4,
                    score = $5,
                    origin = $6,
                    ocr_job_id = COALESCE($7, ocr_job_id),
                    updated_at = NOW()
              WHERE id = $1
            RETURNING *`,
            [ex.id, subject, grade, grade_normalized, score, origin, ocr_job_id]
          );
          results.push(upd.rows[0]);
        } else {
          const ins = await conn.query(
            `INSERT INTO jupeb_result_entries
               (registration_id, source, sitting, serial, subject, grade,
                grade_normalized, score, origin, ocr_job_id, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING *`,
            [
              registration_id,
              source,
              sitting,
              serial,
              subject,
              grade,
              grade_normalized,
              score,
              origin,
              ocr_job_id,
              created_by
            ]
          );
          results.push(ins.rows[0]);
        }
      }

      if (ownClient) await conn.query('COMMIT');
      return results;
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

module.exports = new ResultEntriesModel();
