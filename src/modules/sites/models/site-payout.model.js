const pool = require('../../../db/pool');

class SitePayoutModel {
  static async create({ siteId, provider = 'paystack', amount, currency = 'NGN', transferReference, recipientCode, reason, metadata = {} }) {
    const result = await pool.query(
      `INSERT INTO site_payouts (site_id, provider, amount, currency, transfer_reference, recipient_code, status, reason, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7, $8)
       RETURNING *`,
      [siteId, provider, amount, currency, transferReference || null, recipientCode || null, reason || null, JSON.stringify(metadata)]
    );
    return result.rows[0];
  }

  static async listBySiteId(siteId, { limit = 20, offset = 0 } = {}) {
    const result = await pool.query(
      `SELECT * FROM site_payouts WHERE site_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [siteId, limit, offset]
    );
    return result.rows;
  }

  /** Update status by Paystack transfer_reference (transfer_code). */
  static async updateStatusByReference(transferReference, status) {
    const result = await pool.query(
      `UPDATE site_payouts SET status = $1, updated_at = CURRENT_TIMESTAMP
       WHERE transfer_reference = $2 RETURNING *`,
      [status, transferReference]
    );
    return result.rows[0] || null;
  }
}

module.exports = SitePayoutModel;
