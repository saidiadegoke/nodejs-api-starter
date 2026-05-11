const pool = require('../../../db/pool');

class OcrResultModel {
  static async create({
    job_id,
    exam_type_detected,
    confidence,
    result_json,
    raw_text,
    provider_payload = {},
    page_count = 1
  }) {
    const result = await pool.query(
      `INSERT INTO ocr_results
         (job_id, exam_type_detected, confidence, result_json,
          raw_text, provider_payload, page_count)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
       RETURNING *`,
      [
        job_id,
        exam_type_detected,
        confidence,
        JSON.stringify(result_json),
        raw_text,
        JSON.stringify(provider_payload),
        page_count
      ]
    );
    return result.rows[0];
  }

  static async findByJobId(jobId) {
    const result = await pool.query(
      'SELECT * FROM ocr_results WHERE job_id = $1',
      [jobId]
    );
    return result.rows[0];
  }
}

module.exports = OcrResultModel;
