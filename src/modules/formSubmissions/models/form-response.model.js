const pool = require('../../../db/pool');

const VALID_TYPES = ['note', 'reply', 'status_change'];

async function create(submissionId, type, body, createdBy) {
  const result = await pool.query(
    `INSERT INTO form_responses (submission_id, type, body, created_by)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [submissionId, type, body, createdBy]
  );
  return result.rows[0];
}

async function listBySubmission(submissionId) {
  const result = await pool.query(
    `SELECT * FROM form_responses WHERE submission_id = $1 ORDER BY created_at ASC`,
    [submissionId]
  );
  return result.rows;
}

module.exports = {
  VALID_TYPES,
  create,
  listBySubmission,
};
