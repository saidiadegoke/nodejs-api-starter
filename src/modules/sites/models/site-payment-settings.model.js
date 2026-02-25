const pool = require('../../../db/pool');

class SitePaymentSettingsModel {
  /** Upsert payment settings for a site. Only updates provided fields. */
  static async upsert(siteId, data) {
    const fields = [
      'paystack_public_key',
      'paystack_secret_key',
      'paystack_webhook_secret',
      'dt_bank_name',
      'dt_account_number',
      'dt_account_name',
    ];

    // Build SET clause only for keys that are explicitly provided
    const setClauses = [];
    const values = [siteId];
    let idx = 2;
    for (const field of fields) {
      if (data[field] !== undefined) {
        setClauses.push(`${field} = $${idx}`);
        values.push(data[field]);
        idx++;
      }
    }
    setClauses.push('updated_at = CURRENT_TIMESTAMP');

    const insertCols = ['site_id', ...fields.filter(f => data[f] !== undefined)];
    const insertPlaceholders = insertCols.map((_, i) => `$${i + 1}`);
    const insertValues = [siteId, ...fields.filter(f => data[f] !== undefined).map(f => data[f])];

    const query = `
      INSERT INTO site_payment_settings (${insertCols.join(', ')})
      VALUES (${insertPlaceholders.join(', ')})
      ON CONFLICT (site_id) DO UPDATE SET ${setClauses.join(', ')}
      RETURNING *
    `;

    const result = await pool.query(query, insertValues);
    return result.rows[0];
  }

  /** Get settings for a site. Returns null if not configured. */
  static async getBySiteId(siteId) {
    const result = await pool.query(
      'SELECT * FROM site_payment_settings WHERE site_id = $1',
      [siteId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get settings with secret masked for frontend display.
   * paystack_secret_key is replaced with paystack_secret_key_masked.
   */
  static async getMaskedBySiteId(siteId) {
    const row = await this.getBySiteId(siteId);
    if (!row) return null;
    const masked = { ...row };
    delete masked.paystack_secret_key;
    delete masked.paystack_webhook_secret;
    if (row.paystack_secret_key) {
      const key = row.paystack_secret_key;
      masked.paystack_secret_key_masked = key.length > 8
        ? `${key.slice(0, 7)}***...${key.slice(-4)}`
        : '***';
    } else {
      masked.paystack_secret_key_masked = null;
    }
    masked.paystack_webhook_secret_set = !!row.paystack_webhook_secret;
    return masked;
  }
}

module.exports = SitePaymentSettingsModel;
