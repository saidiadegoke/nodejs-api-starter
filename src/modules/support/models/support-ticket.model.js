const pool = require('../../../db/pool');

class SupportTicketModel {
  static async create(data) {
    const {
      ticket_number,
      user_id,
      university_id = null,
      registration_id = null,
      category,
      subject,
      message,
      priority = 'normal',
      status = 'open',
    } = data;

    const query = `
      INSERT INTO support_tickets (
        ticket_number,
        user_id,
        university_id,
        registration_id,
        category,
        subject,
        message,
        priority,
        status
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;

    const result = await pool.query(query, [
      ticket_number,
      user_id,
      university_id,
      registration_id,
      category,
      subject,
      message,
      priority,
      status,
    ]);

    return result.rows[0];
  }

  static async findById(id) {
    const query = `
      SELECT t.*,
             u.email AS user_email,
             u.phone AS user_phone,
             p.first_name,
             p.last_name,
             p.display_name,
             p.profile_photo_url,
             uni.name AS university_name,
             uni.code AS university_code,
             r.provisional_candidate_code,
             r.jupeb_candidate_number,
             r.status AS registration_status
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_universities uni ON uni.id = t.university_id
        LEFT JOIN jupeb_registrations r ON r.id = t.registration_id
       WHERE t.id = $1
    `;
    const result = await pool.query(query, [id]);
    return result.rows[0] || null;
  }

  static async findByTicketNumber(ticketNumber) {
    const query = `
      SELECT t.*,
             u.email AS user_email,
             p.first_name,
             p.last_name,
             uni.name AS university_name
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_universities uni ON uni.id = t.university_id
       WHERE t.ticket_number = $1
    `;
    const result = await pool.query(query, [ticketNumber]);
    return result.rows[0] || null;
  }

  static async listMyTickets(userId, options = {}) {
    const { status, page = 1, limit = 20 } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const params = [userId];
    let whereClause = `WHERE t.user_id = $1`;

    if (status) {
      params.push(status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    const countQuery = `SELECT COUNT(*) FROM support_tickets t ${whereClause}`;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(Number(limit));
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataQuery = `
      SELECT t.*,
             uni.name AS university_name,
             (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS messages_count
        FROM support_tickets t
        LEFT JOIN jupeb_universities uni ON uni.id = t.university_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const dataRes = await pool.query(dataQuery, params);

    return {
      rows: dataRes.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  }

  static async listInstitutionTickets(universityId, options = {}) {
    const {
      status,
      category,
      q,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = options;

    const offset = (Number(page) - 1) * Number(limit);
    const params = [universityId];
    let whereClause = `WHERE t.university_id = $1`;

    if (status) {
      params.push(status);
      whereClause += ` AND t.status = $${params.length}`;
    }

    if (category) {
      params.push(category);
      whereClause += ` AND t.category = $${params.length}`;
    }

    if (q && String(q).trim()) {
      params.push(`%${String(q).trim().toLowerCase()}%`);
      const idx = params.length;
      whereClause += ` AND (
        LOWER(t.ticket_number) LIKE $${idx} OR
        LOWER(t.subject) LIKE $${idx} OR
        LOWER(t.message) LIKE $${idx} OR
        LOWER(u.email) LIKE $${idx} OR
        LOWER(COALESCE(p.first_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(p.last_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(r.provisional_candidate_code, '')) LIKE $${idx} OR
        LOWER(COALESCE(r.jupeb_candidate_number, '')) LIKE $${idx}
      )`;
    }

    if (date_from) {
      params.push(date_from);
      whereClause += ` AND t.created_at >= $${params.length}`;
    }

    if (date_to) {
      params.push(date_to);
      whereClause += ` AND t.created_at <= $${params.length}`;
    }

    const countQuery = `
      SELECT COUNT(*)
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_registrations r ON r.id = t.registration_id
       ${whereClause}
    `;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(Number(limit));
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataQuery = `
      SELECT t.*,
             u.email AS user_email,
             u.phone AS user_phone,
             p.first_name,
             p.last_name,
             p.display_name,
             p.profile_photo_url,
             r.provisional_candidate_code,
             r.jupeb_candidate_number,
             (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS messages_count
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_registrations r ON r.id = t.registration_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const dataRes = await pool.query(dataQuery, params);

    return {
      rows: dataRes.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  }

  static async listAdminTickets(options = {}) {
    const {
      university_id,
      status,
      category,
      q,
      date_from,
      date_to,
      page = 1,
      limit = 20,
    } = options;

    const offset = (Number(page) - 1) * Number(limit);
    const params = [];
    const conditions = [];

    if (university_id) {
      params.push(university_id);
      conditions.push(`t.university_id = $${params.length}`);
    }

    if (status) {
      params.push(status);
      conditions.push(`t.status = $${params.length}`);
    }

    if (category) {
      params.push(category);
      conditions.push(`t.category = $${params.length}`);
    }

    if (q && String(q).trim()) {
      params.push(`%${String(q).trim().toLowerCase()}%`);
      const idx = params.length;
      conditions.push(`(
        LOWER(t.ticket_number) LIKE $${idx} OR
        LOWER(t.subject) LIKE $${idx} OR
        LOWER(t.message) LIKE $${idx} OR
        LOWER(u.email) LIKE $${idx} OR
        LOWER(COALESCE(p.first_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(p.last_name, '')) LIKE $${idx} OR
        LOWER(COALESCE(uni.name, '')) LIKE $${idx} OR
        LOWER(COALESCE(r.provisional_candidate_code, '')) LIKE $${idx} OR
        LOWER(COALESCE(r.jupeb_candidate_number, '')) LIKE $${idx}
      )`);
    }

    if (date_from) {
      params.push(date_from);
      conditions.push(`t.created_at >= $${params.length}`);
    }

    if (date_to) {
      params.push(date_to);
      conditions.push(`t.created_at <= $${params.length}`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countQuery = `
      SELECT COUNT(*)
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_universities uni ON uni.id = t.university_id
        LEFT JOIN jupeb_registrations r ON r.id = t.registration_id
       ${whereClause}
    `;
    const countRes = await pool.query(countQuery, params);
    const total = parseInt(countRes.rows[0].count, 10);

    params.push(Number(limit));
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;

    const dataQuery = `
      SELECT t.*,
             u.email AS user_email,
             u.phone AS user_phone,
             p.first_name,
             p.last_name,
             p.display_name,
             p.profile_photo_url,
             uni.name AS university_name,
             uni.code AS university_code,
             r.provisional_candidate_code,
             r.jupeb_candidate_number,
             (SELECT COUNT(*) FROM support_ticket_messages m WHERE m.ticket_id = t.id) AS messages_count
        FROM support_tickets t
        JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        LEFT JOIN jupeb_universities uni ON uni.id = t.university_id
        LEFT JOIN jupeb_registrations r ON r.id = t.registration_id
       ${whereClause}
       ORDER BY t.created_at DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const dataRes = await pool.query(dataQuery, params);

    return {
      rows: dataRes.rows,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        total_pages: Math.ceil(total / Number(limit)) || 1,
      },
    };
  }

  static async updateStatus(id, status, metadata = {}) {
    const { resolved_by = null, resolution_notes = null } = metadata;
    const isResolved = status === 'resolved' || status === 'closed';

    const query = `
      UPDATE support_tickets
         SET status = $2,
             resolved_at = CASE WHEN $3 = true THEN COALESCE(resolved_at, CURRENT_TIMESTAMP) ELSE NULL END,
             resolved_by = CASE WHEN $3 = true THEN COALESCE($4, resolved_by) ELSE NULL END,
             resolution_notes = COALESCE($5, resolution_notes),
             updated_at = CURRENT_TIMESTAMP
       WHERE id = $1
       RETURNING *
    `;

    const result = await pool.query(query, [
      id,
      status,
      isResolved,
      resolved_by,
      resolution_notes,
    ]);

    return result.rows[0] || null;
  }

  static async update(id, fields = {}) {
    const allowed = ['priority', 'assigned_to', 'category', 'status', 'resolution_notes'];
    const sets = [];
    const params = [id];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        params.push(fields[key]);
        sets.push(`${key} = $${params.length}`);
      }
    }

    if (sets.length === 0) {
      return this.findById(id);
    }

    sets.push(`updated_at = CURRENT_TIMESTAMP`);
    const query = `
      UPDATE support_tickets
         SET ${sets.join(', ')}
       WHERE id = $1
       RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  static async getInstitutionStats(universityId) {
    const query = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed
      FROM support_tickets
      WHERE university_id = $1
    `;
    const byCategoryQuery = `
      SELECT category, COUNT(*) as count
      FROM support_tickets
      WHERE university_id = $1
      GROUP BY category
      ORDER BY count DESC
    `;

    const [statsRes, catRes] = await Promise.all([
      pool.query(query, [universityId]),
      pool.query(byCategoryQuery, [universityId]),
    ]);

    const s = statsRes.rows[0];
    return {
      total: parseInt(s.total, 10),
      open: parseInt(s.open, 10),
      in_progress: parseInt(s.in_progress, 10),
      resolved: parseInt(s.resolved, 10),
      closed: parseInt(s.closed, 10),
      by_category: catRes.rows.map((r) => ({ category: r.category, count: parseInt(r.count, 10) })),
    };
  }

  static async getAdminStats() {
    const query = `
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE status = 'open') AS open,
        COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress,
        COUNT(*) FILTER (WHERE status = 'resolved') AS resolved,
        COUNT(*) FILTER (WHERE status = 'closed') AS closed
      FROM support_tickets
    `;
    const byCategoryQuery = `
      SELECT category, COUNT(*) as count
      FROM support_tickets
      GROUP BY category
      ORDER BY count DESC
    `;
    const byUniversityQuery = `
      SELECT uni.id, uni.name, uni.code, COUNT(t.id) as count
      FROM support_tickets t
      JOIN jupeb_universities uni ON uni.id = t.university_id
      GROUP BY uni.id, uni.name, uni.code
      ORDER BY count DESC
      LIMIT 10
    `;

    const [statsRes, catRes, uniRes] = await Promise.all([
      pool.query(query),
      pool.query(byCategoryQuery),
      pool.query(byUniversityQuery),
    ]);

    const s = statsRes.rows[0];
    return {
      total: parseInt(s.total, 10),
      open: parseInt(s.open, 10),
      in_progress: parseInt(s.in_progress, 10),
      resolved: parseInt(s.resolved, 10),
      closed: parseInt(s.closed, 10),
      by_category: catRes.rows.map((r) => ({ category: r.category, count: parseInt(r.count, 10) })),
      by_university: uniRes.rows.map((r) => ({
        university_id: r.id,
        name: r.name,
        code: r.code,
        count: parseInt(r.count, 10),
      })),
    };
  }
}

module.exports = SupportTicketModel;
