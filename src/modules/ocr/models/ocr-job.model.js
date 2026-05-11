const pool = require('../../../db/pool');

class OcrJobModel {
  static async create({
    file_id,
    exam_type = 'auto',
    provider = 'pdf_text',
    requested_by,
    requested_for = null,
    context = null,
    metadata = {},
    max_attempts = 3
  }) {
    const result = await pool.query(
      `INSERT INTO ocr_jobs
         (file_id, exam_type, provider, requested_by, requested_for,
          context, metadata, max_attempts)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [
        file_id,
        exam_type,
        provider,
        requested_by,
        requested_for,
        context,
        JSON.stringify(metadata),
        max_attempts
      ]
    );
    return result.rows[0];
  }

  static async findById(id) {
    const result = await pool.query('SELECT * FROM ocr_jobs WHERE id = $1', [id]);
    return result.rows[0];
  }

  static async findLatestCompletedByFile(fileId) {
    const result = await pool.query(
      `SELECT * FROM ocr_jobs
       WHERE file_id = $1 AND status = 'completed'
       ORDER BY completed_at DESC
       LIMIT 1`,
      [fileId]
    );
    return result.rows[0];
  }

  static async list({ requestedBy = null, status = null, examType = null, fileId = null, page = 1, limit = 50 }) {
    const safePage = Math.max(1, parseInt(page, 10) || 1);
    const safeLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
    const offset = (safePage - 1) * safeLimit;

    const conditions = [];
    const params = [];
    let n = 1;

    if (requestedBy) {
      conditions.push(`requested_by = $${n++}`);
      params.push(requestedBy);
    }
    if (status) {
      conditions.push(`status = $${n++}`);
      params.push(status);
    }
    if (examType) {
      conditions.push(`exam_type = $${n++}`);
      params.push(examType);
    }
    if (fileId) {
      conditions.push(`file_id = $${n++}`);
      params.push(fileId);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS count FROM ocr_jobs ${whereSql}`,
      params
    );
    const total = countResult.rows[0].count;

    const dataResult = await pool.query(
      `SELECT * FROM ocr_jobs
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT $${n++} OFFSET $${n}`,
      [...params, safeLimit, offset]
    );

    return { rows: dataResult.rows, total, page: safePage, limit: safeLimit };
  }

  static async markStarted(id, provider) {
    const result = await pool.query(
      `UPDATE ocr_jobs
         SET status = 'processing',
             provider = COALESCE($2, provider),
             attempt_count = attempt_count + 1,
             started_at = COALESCE(started_at, NOW()),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, provider || null]
    );
    return result.rows[0];
  }

  static async markCompleted(id, provider) {
    const result = await pool.query(
      `UPDATE ocr_jobs
         SET status = 'completed',
             provider = COALESCE($2, provider),
             error_code = NULL,
             error_message = NULL,
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, provider || null]
    );
    return result.rows[0];
  }

  static async markFailed(id, errorCode, errorMessage) {
    const result = await pool.query(
      `UPDATE ocr_jobs
         SET status = 'failed',
             error_code = $2,
             error_message = $3,
             completed_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, errorCode, errorMessage]
    );
    return result.rows[0];
  }

  static async markQueued(id) {
    const result = await pool.query(
      `UPDATE ocr_jobs
         SET status = 'queued',
             error_code = NULL,
             error_message = NULL,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id]
    );
    return result.rows[0];
  }

  static async updateMetadata(id, metadata) {
    const result = await pool.query(
      `UPDATE ocr_jobs
         SET metadata = $2::jsonb,
             updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }
}

module.exports = OcrJobModel;
