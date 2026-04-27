const pool = require('../../../db/pool');

class Payment {
  async create(data) {
    const {
      payment_id,
      amount,
      currency = 'NGN',
      type,
      payment_type,
      status = 'pending',
      payment_method,
      payment_method_id = null,
      transaction_ref,
      processor_response,
      user_id,
      anonymous_donor_first_name,
      anonymous_donor_last_name,
      anonymous_donor_email,
      anonymous_donor_phone,
      campaign_id,
      subscription_id,
      purpose,
      metadata = {},
      user_agent,
      ip_address,
      source = 'web',
      is_recurring = false,
      recurring_interval,
      notes,
      internal_notes,
      registration_id,
    } = data;

    const result = await pool.query(
      `INSERT INTO payments (
        payment_id, amount, currency, type, payment_type, status, payment_method, payment_method_id,
        transaction_ref, processor_response, user_id,
        anonymous_donor_first_name, anonymous_donor_last_name, anonymous_donor_email, anonymous_donor_phone,
        campaign_id, subscription_id, purpose, metadata, user_agent, ip_address,
        source, is_recurring, recurring_interval, notes, internal_notes, registration_id
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,
        $12,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21::inet,
        $22,$23,$24,$25,$26,$27
      ) RETURNING *`,
      [
        payment_id,
        amount,
        currency,
        type,
        payment_type || type,
        status,
        payment_method,
        payment_method_id,
        transaction_ref || null,
        processor_response ? JSON.stringify(processor_response) : null,
        user_id || null,
        anonymous_donor_first_name || null,
        anonymous_donor_last_name || null,
        anonymous_donor_email || null,
        anonymous_donor_phone || null,
        campaign_id || null,
        subscription_id || null,
        purpose || null,
        JSON.stringify(metadata),
        user_agent || null,
        ip_address || null,
        source,
        is_recurring,
        recurring_interval || null,
        notes || null,
        internal_notes || null,
        registration_id || null,
      ]
    );
    return result.rows[0];
  }

  async findById(id) {
    const result = await pool.query('SELECT * FROM payments WHERE id = $1', [id]);
    return result.rows[0];
  }

  async findByPaymentId(paymentId) {
    const result = await pool.query('SELECT * FROM payments WHERE payment_id = $1', [paymentId]);
    return result.rows[0];
  }

  async findByTransactionRef(ref) {
    const result = await pool.query(
      'SELECT * FROM payments WHERE transaction_ref = $1 OR payment_id = $1 LIMIT 1',
      [ref]
    );
    return result.rows[0];
  }

  async updateStatus(id, status, additional = {}) {
    const { transaction_ref, processor_response, paid_at, receipt_url, notes } = additional;
    const values = [status];
    const parts = ['status = $1', 'updated_at = CURRENT_TIMESTAMP'];
    let idx = 2;
    if (transaction_ref !== undefined && transaction_ref !== null) {
      parts.push(`transaction_ref = $${idx++}`);
      values.push(transaction_ref);
    }
    if (processor_response !== undefined && processor_response !== null) {
      parts.push(`processor_response = $${idx++}::jsonb`);
      values.push(
        typeof processor_response === 'string' ? processor_response : JSON.stringify(processor_response)
      );
    }
    if (paid_at) {
      parts.push(`paid_at = $${idx++}`);
      values.push(paid_at);
    }
    if (receipt_url) {
      parts.push(`receipt_url = $${idx++}`);
      values.push(receipt_url);
    }
    if (notes !== undefined) {
      parts.push(`notes = $${idx++}`);
      values.push(notes);
    }
    values.push(id);
    const result = await pool.query(
      `UPDATE payments SET ${parts.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return result.rows[0];
  }

  async findByUserId(userId, options = {}) {
    const { limit = 20, offset = 0, status, payment_type } = options;
    const values = [userId];
    let q = `
      SELECT p.* FROM payments p
      WHERE (p.user_id = $1 OR p.anonymous_donor_email IN (SELECT email FROM users WHERE id = $1 AND email IS NOT NULL))
    `;
    let i = 2;
    if (payment_type) {
      q += ` AND p.type = $${i++}`;
      values.push(payment_type);
    }
    if (status) {
      q += ` AND p.status = $${i++}`;
      values.push(status);
    }
    q += ` ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async getUserPaymentsCount(userId, status = null, payment_type = null) {
    const values = [userId];
    let q = `
      SELECT COUNT(*)::int AS total FROM payments p
      WHERE (p.user_id = $1 OR p.anonymous_donor_email IN (SELECT email FROM users WHERE id = $1 AND email IS NOT NULL))
    `;
    let i = 2;
    if (payment_type) {
      q += ` AND p.type = $${i++}`;
      values.push(payment_type);
    }
    if (status) {
      q += ` AND p.status = $${i++}`;
      values.push(status);
    }
    const result = await pool.query(q, values);
    return result.rows[0].total;
  }

  async getUserDonationSummary(userId) {
    const result = await pool.query(
      `SELECT
        COALESCE(COUNT(*), 0)::int AS total_donations,
        COALESCE(SUM(CASE WHEN p.status IN ('completed', 'pending') THEN p.amount ELSE 0 END), 0) AS total_amount,
        COALESCE(AVG(CASE WHEN p.status IN ('completed', 'pending') THEN p.amount END), 0) AS average_donation,
        COALESCE(COUNT(DISTINCT p.campaign_id) FILTER (WHERE p.campaign_id IS NOT NULL), 0)::int AS linked_records,
        MAX(p.created_at) AS last_payment_date
      FROM payments p
      WHERE (p.user_id = $1 OR p.anonymous_donor_email IN (SELECT email FROM users WHERE id = $1 AND email IS NOT NULL))
        AND p.type IN ('donation', 'campaign', 'dues')`,
      [userId]
    );
    const row = result.rows[0];
    return {
      total_donations: row.total_donations,
      total_amount: parseFloat(row.total_amount) || 0,
      average_donation: parseFloat(row.average_donation) || 0,
      linked_records: row.linked_records,
      last_payment_date: row.last_payment_date,
    };
  }

  async findByCampaignId(campaignId, options = {}) {
    const { limit = 20, offset = 0, status } = options;
    const values = [campaignId];
    let q = 'SELECT * FROM payments WHERE campaign_id = $1';
    let i = 2;
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    q += ` ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`;
    values.push(limit, offset);
    const result = await pool.query(q, values);
    return result.rows;
  }

  async findByRegistrationId(registrationId, options = {}) {
    const { limit = 50, offset = 0 } = options;
    const result = await pool.query(
      `SELECT * FROM payments WHERE registration_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [registrationId, limit, offset]
    );
    return result.rows;
  }

  async countPendingForRegistration(registrationId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM payments
       WHERE registration_id = $1 AND status IN ('pending', 'pending_transfer', 'processing')`,
      [registrationId]
    );
    return result.rows[0].c;
  }

  async findJupebByUserId(userId, options = {}) {
    const { limit = 20, offset = 0 } = options;
    const result = await pool.query(
      `SELECT p.* FROM payments p
       INNER JOIN jupeb_registrations r ON r.id = p.registration_id
       WHERE r.user_id = $1
       ORDER BY p.created_at DESC LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );
    return result.rows;
  }

  async countJupebByUserId(userId) {
    const result = await pool.query(
      `SELECT COUNT(*)::int AS c FROM payments p
       INNER JOIN jupeb_registrations r ON r.id = p.registration_id
       WHERE r.user_id = $1`,
      [userId]
    );
    return result.rows[0].c;
  }

  async findJupebLinkedWithRegistration({ limit = 50, offset = 0, session_id }) {
    const values = [];
    let i = 1;
    let where = 'WHERE p.registration_id IS NOT NULL';
    if (session_id) {
      where += ` AND r.session_id = $${i++}`;
      values.push(session_id);
    }
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payments p
       INNER JOIN jupeb_registrations r ON r.id = p.registration_id
       ${where}`,
      values
    );
    const total = countResult.rows[0].total;
    const dataResult = await pool.query(
      `SELECT p.*, r.session_id AS jupeb_session_id, r.university_id AS jupeb_university_id
       FROM payments p
       INNER JOIN jupeb_registrations r ON r.id = p.registration_id
       ${where}
       ORDER BY p.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    );
    return { rows: dataResult.rows, total };
  }

  async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      status,
      type,
      payment_method,
      start_date,
      end_date,
      campaign,
    } = options;
    const values = [];
    let where = 'WHERE 1=1';
    let i = 1;
    if (status) {
      where += ` AND p.status = $${i++}`;
      values.push(status);
    }
    if (type) {
      where += ` AND p.type = $${i++}`;
      values.push(type);
    }
    if (payment_method) {
      where += ` AND p.payment_method = $${i++}`;
      values.push(payment_method);
    }
    if (start_date) {
      where += ` AND p.created_at >= $${i++}`;
      values.push(start_date);
    }
    if (end_date) {
      where += ` AND p.created_at <= $${i++}`;
      values.push(end_date);
    }
    if (campaign === 'general') {
      where += ' AND p.campaign_id IS NULL';
    } else if (campaign) {
      where += ` AND p.campaign_id = $${i++}`;
      values.push(campaign);
    }
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM payments p ${where}`,
      values
    );
    const total = countResult.rows[0].total;
    const dataResult = await pool.query(
      `SELECT p.* FROM payments p ${where} ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
      [...values, limit, offset]
    );
    return {
      payments: dataResult.rows,
      total,
      page: Math.floor(offset / limit) + 1,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  async getStats(filters = {}) {
    const { start_date, end_date, status, type } = filters;
    const values = [];
    let q = `
      SELECT
        COUNT(*)::int AS total_payments,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_payments,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_amount,
        AVG(amount) FILTER (WHERE status = 'completed') AS average_amount,
        (
          COUNT(DISTINCT user_id) FILTER (WHERE status = 'completed' AND user_id IS NOT NULL)
          + COUNT(DISTINCT anonymous_donor_email) FILTER (WHERE status = 'completed' AND user_id IS NULL AND anonymous_donor_email IS NOT NULL)
        )::int AS unique_payers,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND type = 'donation'), 0) AS total_donations,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND type = 'dues'), 0) AS total_dues,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed' AND type = 'campaign'), 0) AS total_campaign_payments
      FROM payments WHERE 1=1`;
    let i = 1;
    if (start_date) {
      q += ` AND created_at >= $${i++}`;
      values.push(start_date);
    }
    if (end_date) {
      q += ` AND created_at <= $${i++}`;
      values.push(end_date);
    }
    if (status) {
      q += ` AND status = $${i++}`;
      values.push(status);
    }
    if (type) {
      q += ` AND type = $${i++}`;
      values.push(type);
    }
    const result = await pool.query(q, values);
    return result.rows[0];
  }

  async getSummaryStats() {
    const result = await pool.query(`
      SELECT
        COUNT(*)::int AS total_payments,
        COALESCE(SUM(amount) FILTER (WHERE status = 'completed'), 0) AS total_amount,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS completed_payments,
        COUNT(*) FILTER (WHERE status = 'pending_verification')::int AS pending_verification,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_payments,
        AVG(amount) FILTER (WHERE status = 'completed') AS average_amount
      FROM payments`);
    const s = result.rows[0];
    return {
      total_payments: s.total_payments,
      total_amount: parseFloat(s.total_amount) || 0,
      completed_payments: s.completed_payments,
      pending_verification: s.pending_verification,
      failed_payments: s.failed_payments,
      average_amount: parseFloat(s.average_amount) || 0,
    };
  }

  async getRecentPayments(limit = 5) {
    const result = await pool.query(
      `SELECT p.id, p.payment_id, p.amount, p.currency, p.type, p.status, p.created_at, p.paid_at,
        COALESCE(p.anonymous_donor_email, u.email) AS payer_email
      FROM payments p
      LEFT JOIN users u ON p.user_id = u.id
      WHERE p.status = 'completed'
      ORDER BY p.created_at DESC
      LIMIT $1`,
      [limit]
    );
    return result.rows.map((row) => ({
      id: row.id,
      amount: parseFloat(row.amount),
      type: row.type,
      payerLabel: row.payer_email || 'Anonymous',
      date: row.created_at,
    }));
  }

  async updateReceipt(internalId, { receipt_file_id, notes, status }) {
    const result = await pool.query(
      `UPDATE payments SET receipt_file_id = $1, notes = COALESCE($2, notes), status = $3, updated_at = CURRENT_TIMESTAMP
       WHERE id = $4 RETURNING *`,
      [receipt_file_id, notes, status, internalId]
    );
    return result.rows[0];
  }

  async delete(id) {
    const result = await pool.query('DELETE FROM payments WHERE id = $1 RETURNING *', [id]);
    return result.rows[0];
  }
}

module.exports = new Payment();
