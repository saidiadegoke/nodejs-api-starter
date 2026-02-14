const pool = require('../../../db/pool');

const VALID_STATUSES = ['new', 'read', 'replied', 'archived'];

async function create(data) {
  const {
    formInstanceId,
    siteId,
    pageId,
    blockId,
    payload,
    status = 'new',
    sourceUrl,
    ipAddress,
    userAgent,
  } = data;
  const result = await pool.query(
    `INSERT INTO form_submissions (form_instance_id, site_id, page_id, block_id, payload, status, source_url, ip_address, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     RETURNING *`,
    [
      formInstanceId,
      siteId,
      pageId,
      blockId,
      JSON.stringify(payload || {}),
      status,
      sourceUrl || null,
      ipAddress || null,
      userAgent || null,
    ]
  );
  return result.rows[0];
}

async function getById(id, siteId) {
  const result = await pool.query(
    'SELECT * FROM form_submissions WHERE id = $1 AND site_id = $2',
    [id, siteId]
  );
  return result.rows[0];
}

async function listByFormInstance(formInstanceId, siteId, options = {}) {
  const { page = 1, limit = 20, status } = options;
  const offset = (Math.max(1, page) - 1) * limit;
  const whereParams = [formInstanceId, siteId];
  let where = 'WHERE form_instance_id = $1 AND site_id = $2';
  if (status) {
    whereParams.push(status);
    where += ` AND status = $${whereParams.length}`;
  }
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM form_submissions ${where}`,
    whereParams
  );
  const total = parseInt(countResult.rows[0].total, 10);
  const listParams = [...whereParams, limit, offset];
  const result = await pool.query(
    `SELECT id, payload, status, created_at, updated_at,
            (SELECT COUNT(*) FROM form_responses fr WHERE fr.submission_id = form_submissions.id) AS responses_count
     FROM form_submissions
     ${where}
     ORDER BY created_at DESC
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams
  );
  return { items: result.rows, total, page: Math.max(1, page), limit };
}

async function updateStatus(id, siteId, status) {
  const result = await pool.query(
    'UPDATE form_submissions SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND site_id = $3 RETURNING *',
    [status, id, siteId]
  );
  return result.rows[0];
}

module.exports = {
  VALID_STATUSES,
  create,
  getById,
  listByFormInstance,
  updateStatus,
};
