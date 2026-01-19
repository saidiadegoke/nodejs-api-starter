const pool = require('../../../db/pool');

class CampaignBankAccount {
  constructor(data) {
    this.id = data.id;
    this.campaign_id = data.campaign_id;
    this.bank_account_id = data.bank_account_id;
    this.is_primary = data.is_primary;
    this.is_active = data.is_active;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new campaign bank account association
  static async create(data) {
    const {
      campaign_id,
      bank_account_id,
      is_primary = false,
      is_active = true
    } = data;

    // If this is being set as primary, unset other primary accounts for this campaign
    if (is_primary) {
      await pool.query(`
        UPDATE campaign_bank_accounts 
        SET is_primary = false 
        WHERE campaign_id = $1
      `, [campaign_id]);
    }

    const query = `
      INSERT INTO campaign_bank_accounts (
        campaign_id, bank_account_id, is_primary, is_active
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `;

    const values = [campaign_id, bank_account_id, is_primary, is_active];

    try {
      const result = await pool.query(query, values);
      return new CampaignBankAccount(result.rows[0]);
    } catch (error) {
      throw new Error(`Error creating campaign bank account: ${error.message}`);
    }
  }

  // Get bank accounts for a specific campaign
  static async getByCampaignId(campaignId, includeInactive = false) {
    let query = `
      SELECT 
        cba.*,
        ba.bank_name,
        ba.account_name,
        ba.account_number,
        ba.is_active as bank_account_active
      FROM campaign_bank_accounts cba
      JOIN bank_accounts ba ON cba.bank_account_id = ba.id
      WHERE cba.campaign_id = $1
    `;

    if (!includeInactive) {
      query += ' AND cba.is_active = true AND ba.is_active = true';
    }

    query += ' ORDER BY cba.is_primary DESC, ba.bank_name, ba.account_name';

    try {
      const result = await pool.query(query, [campaignId]);
      return result.rows.map(row => ({
        ...new CampaignBankAccount(row),
        bank_name: row.bank_name,
        account_name: row.account_name,
        account_number: row.account_number,
        bank_account_active: row.bank_account_active
      }));
    } catch (error) {
      throw new Error(`Error getting campaign bank accounts: ${error.message}`);
    }
  }

  // Get campaigns for a specific bank account
  static async getByBankAccountId(bankAccountId, includeInactive = false) {
    let query = `
      SELECT 
        cba.*,
        c.name as campaign_name,
        c.slug as campaign_slug,
        c.type as campaign_type,
        c.status as campaign_status
      FROM campaign_bank_accounts cba
      JOIN campaigns c ON cba.campaign_id = c.id
      WHERE cba.bank_account_id = $1 AND c.deleted_at IS NULL
    `;

    if (!includeInactive) {
      query += ' AND cba.is_active = true AND c.status = \'active\'';
    }

    query += ' ORDER BY c.name';

    try {
      const result = await pool.query(query, [bankAccountId]);
      return result.rows.map(row => ({
        ...new CampaignBankAccount(row),
        campaign_name: row.campaign_name,
        campaign_slug: row.campaign_slug,
        campaign_type: row.campaign_type,
        campaign_status: row.campaign_status
      }));
    } catch (error) {
      throw new Error(`Error getting bank account campaigns: ${error.message}`);
    }
  }

  // Get primary bank account for a campaign
  static async getPrimaryByCampaignId(campaignId) {
    const query = `
      SELECT 
        cba.*,
        ba.bank_name,
        ba.account_name,
        ba.account_number,
        ba.is_active as bank_account_active
      FROM campaign_bank_accounts cba
      JOIN bank_accounts ba ON cba.bank_account_id = ba.id
      WHERE cba.campaign_id = $1 
        AND cba.is_primary = true 
        AND cba.is_active = true 
        AND ba.is_active = true
      LIMIT 1
    `;

    try {
      const result = await pool.query(query, [campaignId]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        ...new CampaignBankAccount(row),
        bank_name: row.bank_name,
        account_name: row.account_name,
        account_number: row.account_number,
        bank_account_active: row.bank_account_active
      };
    } catch (error) {
      throw new Error(`Error getting primary bank account: ${error.message}`);
    }
  }

  // Update a campaign bank account association
  static async update(id, updates) {
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.is_primary !== undefined) {
      updateFields.push(`is_primary = $${paramIndex++}`);
      values.push(updates.is_primary);
    }

    if (updates.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    if (updateFields.length === 0) {
      return null;
    }

    // If this is being set as primary, unset other primary accounts for this campaign
    if (updates.is_primary) {
      const currentRecord = await this.findById(id);
      if (currentRecord) {
        await pool.query(`
          UPDATE campaign_bank_accounts 
          SET is_primary = false 
          WHERE campaign_id = $1 AND id != $2
        `, [currentRecord.campaign_id, id]);
      }
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE campaign_bank_accounts 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows.length > 0 ? new CampaignBankAccount(result.rows[0]) : null;
    } catch (error) {
      throw new Error(`Error updating campaign bank account: ${error.message}`);
    }
  }

  // Delete a campaign bank account association
  static async delete(id) {
    const query = 'DELETE FROM campaign_bank_accounts WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new CampaignBankAccount(result.rows[0]) : null;
    } catch (error) {
      throw new Error(`Error deleting campaign bank account: ${error.message}`);
    }
  }

  // Check if a campaign has any bank accounts
  static async hasBankAccounts(campaignId) {
    const query = `
      SELECT COUNT(*) as count
      FROM campaign_bank_accounts cba
      JOIN bank_accounts ba ON cba.bank_account_id = ba.id
      WHERE cba.campaign_id = $1 
        AND cba.is_active = true 
        AND ba.is_active = true
    `;

    try {
      const result = await pool.query(query, [campaignId]);
      return parseInt(result.rows[0].count) > 0;
    } catch (error) {
      throw new Error(`Error checking bank accounts: ${error.message}`);
    }
  }

  // Get fallback bank account (first available if no primary)
  static async getFallbackByCampaignId(campaignId) {
    const query = `
      SELECT 
        cba.*,
        ba.bank_name,
        ba.account_name,
        ba.account_number,
        ba.is_active as bank_account_active
      FROM campaign_bank_accounts cba
      JOIN bank_accounts ba ON cba.bank_account_id = ba.id
      WHERE cba.campaign_id = $1 
        AND cba.is_active = true 
        AND ba.is_active = true
      ORDER BY cba.is_primary DESC, ba.bank_name, ba.account_name
      LIMIT 1
    `;

    try {
      const result = await pool.query(query, [campaignId]);
      if (result.rows.length === 0) {
        return null;
      }
      const row = result.rows[0];
      return {
        ...new CampaignBankAccount(row),
        bank_name: row.bank_name,
        account_name: row.account_name,
        account_number: row.account_number,
        bank_account_active: row.bank_account_active
      };
    } catch (error) {
      throw new Error(`Error getting fallback bank account: ${error.message}`);
    }
  }
}

module.exports = CampaignBankAccount;
