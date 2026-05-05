const pool = require('../../../db/pool');

class AdminErrorLogModel {
  static async insert(entry) {
    await pool.query(
      `INSERT INTO request_logs
        (method, path, status_code, duration_ms, request_id, user_id, ip_address, user_agent,
         request_body, request_query, response_body, error_message, error_stack)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        entry.method,
        entry.path,
        entry.statusCode,
        entry.durationMs,
        entry.requestId,
        entry.userId || null,
        entry.ip || null,
        entry.userAgent || null,
        entry.requestBody ? JSON.stringify(entry.requestBody) : null,
        entry.requestQuery ? JSON.stringify(entry.requestQuery) : null,
        entry.responseBody ? JSON.stringify(entry.responseBody) : null,
        entry.errorMessage || null,
        entry.errorStack || null,
      ]
    );
  }

  static async getStats() {
    const [errorResult, counterResult] = await Promise.all([
      pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE status_code >= 400)::int AS total_errors,
          COUNT(*) FILTER (WHERE status_code >= 500)::int AS server_errors,
          COUNT(*) FILTER (WHERE status_code >= 400 AND status_code < 500)::int AS client_errors,
          COUNT(*) FILTER (WHERE duration_ms >= 3000)::int AS slow_requests,
          COUNT(*) FILTER (WHERE status_code >= 400 AND created_at >= NOW() - INTERVAL '24 hours')::int AS errors_today,
          COUNT(*) FILTER (WHERE status_code >= 400 AND created_at >= NOW() - INTERVAL '1 hour')::int AS errors_last_hour,
          ROUND(AVG(duration_ms) FILTER (WHERE status_code >= 400))::int AS avg_error_duration
        FROM request_logs
      `),
      pool.query(`
        SELECT
          COALESCE(SUM(total_requests), 0)::int AS total_requests,
          COALESCE(SUM(success_requests), 0)::int AS success_requests,
          COALESCE(SUM(error_requests), 0)::int AS total_error_requests,
          COALESCE(SUM(slow_requests), 0)::int AS total_slow_requests,
          COALESCE(SUM(total_requests) FILTER (WHERE bucket >= NOW() - INTERVAL '24 hours'), 0)::int AS requests_today,
          COALESCE(SUM(total_requests) FILTER (WHERE bucket >= NOW() - INTERVAL '1 hour'), 0)::int AS requests_last_hour
        FROM request_counters
      `),
    ]);
    return { ...errorResult.rows[0], ...counterResult.rows[0] };
  }

  static async list({ page = 1, limit = 20, type, method, path, from, to }) {
    const conditions = [];
    const params = [];
    let idx = 1;

    if (type === 'error') {
      conditions.push('status_code >= 400');
    } else if (type === 'slow') {
      conditions.push('duration_ms >= 3000');
    } else if (type === '5xx') {
      conditions.push('status_code >= 500');
    } else if (type === '4xx') {
      conditions.push('status_code >= 400 AND status_code < 500');
    } else {
      conditions.push('(status_code >= 400 OR duration_ms >= 3000)');
    }

    if (method) {
      conditions.push(`method = $${idx++}`);
      params.push(method.toUpperCase());
    }
    if (path) {
      conditions.push(`path ILIKE $${idx++}`);
      params.push(`%${path}%`);
    }
    if (from) {
      conditions.push(`created_at >= $${idx++}`);
      params.push(from);
    }
    if (to) {
      conditions.push(`created_at <= $${idx++}`);
      params.push(to);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const offset = (page - 1) * limit;

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM request_logs ${where}`, params),
      pool.query(
        `SELECT id, method, path, status_code, duration_ms, request_id, user_id,
                ip_address, error_message, created_at
         FROM request_logs ${where}
         ORDER BY created_at DESC
         LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      ),
    ]);

    return {
      entries: dataResult.rows,
      total: countResult.rows[0].total,
    };
  }

  static async getById(id) {
    const result = await pool.query('SELECT * FROM request_logs WHERE id = $1', [id]);
    return result.rows[0] || null;
  }
}

module.exports = AdminErrorLogModel;
