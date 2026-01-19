const pool = require('../../../db/pool');

class CampaignPaymentMethod {
  constructor(data) {
    this.id = data.id;
    this.campaign_id = data.campaign_id;
    this.payment_method_id = data.payment_method_id;
    this.is_active = data.is_active;
    this.processing_fee_override = data.processing_fee_override;
    this.processing_fee_type_override = data.processing_fee_type_override;
    this.created_at = data.created_at;
    this.updated_at = data.updated_at;
  }

  // Create a new campaign payment method association
  static async create(data) {
    const {
      campaign_id,
      payment_method_id,
      is_active = true,
      processing_fee_override,
      processing_fee_type_override
    } = data;

    const query = `
      INSERT INTO campaign_payment_methods (
        campaign_id, payment_method_id, is_active, 
        processing_fee_override, processing_fee_type_override
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      campaign_id,
      payment_method_id,
      is_active,
      processing_fee_override,
      processing_fee_type_override
    ];

    try {
      const result = await pool.query(query, values);
      return new CampaignPaymentMethod(result.rows[0]);
    } catch (error) {
      throw new Error(`Error creating campaign payment method: ${error.message}`);
    }
  }

  // Get payment methods for a specific campaign
  static async getByCampaignId(campaignId, includeInactive = false) {
    let query = `
      SELECT 
        cpm.*,
        pm.name as payment_method_name,
        pm.code as payment_method_code,
        pm.type as payment_method_type,
        pm.display_name as payment_method_display_name,
        pm.icon_url as payment_method_icon,
        pm.processing_fee as default_processing_fee,
        pm.processing_fee_type as default_processing_fee_type
      FROM campaign_payment_methods cpm
      JOIN payment_methods pm ON cpm.payment_method_id = pm.id
      WHERE cpm.campaign_id = $1
    `;

    if (!includeInactive) {
      query += ' AND cpm.is_active = true AND pm.is_active = true';
    }

    query += ' ORDER BY pm.display_name';

    try {
      const result = await pool.query(query, [campaignId]);
      return result.rows.map(row => ({
        ...new CampaignPaymentMethod(row),
        payment_method_name: row.payment_method_name,
        payment_method_code: row.payment_method_code,
        payment_method_type: row.payment_method_type,
        payment_method_display_name: row.payment_method_display_name,
        payment_method_icon: row.payment_method_icon,
        default_processing_fee: row.default_processing_fee,
        default_processing_fee_type: row.default_processing_fee_type,
        effective_processing_fee: row.processing_fee_override || row.default_processing_fee,
        effective_processing_fee_type: row.processing_fee_type_override || row.default_processing_fee_type
      }));
    } catch (error) {
      throw new Error(`Error getting campaign payment methods: ${error.message}`);
    }
  }

  // Get campaigns for a specific payment method
  static async getByPaymentMethodId(paymentMethodId, includeInactive = false) {
    let query = `
      SELECT 
        cpm.*,
        c.name as campaign_name,
        c.slug as campaign_slug,
        c.type as campaign_type,
        c.status as campaign_status
      FROM campaign_payment_methods cpm
      JOIN campaigns c ON cpm.campaign_id = c.id
      WHERE cpm.payment_method_id = $1 AND c.deleted_at IS NULL
    `;

    if (!includeInactive) {
      query += ' AND cpm.is_active = true AND c.status = \'active\'';
    }

    query += ' ORDER BY c.name';

    try {
      const result = await pool.query(query, [paymentMethodId]);
      return result.rows.map(row => ({
        ...new CampaignPaymentMethod(row),
        campaign_name: row.campaign_name,
        campaign_slug: row.campaign_slug,
        campaign_type: row.campaign_type,
        campaign_status: row.campaign_status
      }));
    } catch (error) {
      throw new Error(`Error getting payment method campaigns: ${error.message}`);
    }
  }

  // Update a campaign payment method association
  static async update(id, updates) {
    const updateFields = [];
    const values = [];
    let paramIndex = 1;

    if (updates.is_active !== undefined) {
      updateFields.push(`is_active = $${paramIndex++}`);
      values.push(updates.is_active);
    }

    if (updates.processing_fee_override !== undefined) {
      updateFields.push(`processing_fee_override = $${paramIndex++}`);
      values.push(updates.processing_fee_override);
    }

    if (updates.processing_fee_type_override !== undefined) {
      updateFields.push(`processing_fee_type_override = $${paramIndex++}`);
      values.push(updates.processing_fee_type_override);
    }

    if (updateFields.length === 0) {
      return null;
    }

    updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE campaign_payment_methods 
      SET ${updateFields.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows.length > 0 ? new CampaignPaymentMethod(result.rows[0]) : null;
    } catch (error) {
      throw new Error(`Error updating campaign payment method: ${error.message}`);
    }
  }

  // Delete a campaign payment method association
  static async delete(id) {
    const query = 'DELETE FROM campaign_payment_methods WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows.length > 0 ? new CampaignPaymentMethod(result.rows[0]) : null;
    } catch (error) {
      throw new Error(`Error deleting campaign payment method: ${error.message}`);
    }
  }

  // Check if a campaign supports a specific payment method
  static async isSupported(campaignId, paymentMethodCode) {
    const query = `
      SELECT cpm.id 
      FROM campaign_payment_methods cpm
      JOIN payment_methods pm ON cpm.payment_method_id = pm.id
      WHERE cpm.campaign_id = $1 
        AND pm.code = $2 
        AND cpm.is_active = true 
        AND pm.is_active = true
    `;

    try {
      const result = await pool.query(query, [campaignId, paymentMethodCode]);
      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Error checking payment method support: ${error.message}`);
    }
  }

  // Get processing fee for a campaign and payment method
  static async getProcessingFee(campaignId, paymentMethodCode) {
    const query = `
      SELECT 
        COALESCE(cpm.processing_fee_override, pm.processing_fee) as effective_fee,
        COALESCE(cpm.processing_fee_type_override, pm.processing_fee_type) as effective_fee_type
      FROM campaign_payment_methods cpm
      JOIN payment_methods pm ON cpm.payment_method_id = pm.id
      WHERE cpm.campaign_id = $1 
        AND pm.code = $2 
        AND cpm.is_active = true 
        AND pm.is_active = true
    `;

    try {
      const result = await pool.query(query, [campaignId, paymentMethodCode]);
      if (result.rows.length === 0) {
        return null;
      }
      return {
        fee: parseFloat(result.rows[0].effective_fee) || 0,
        feeType: result.rows[0].effective_fee_type || 'percentage'
      };
    } catch (error) {
      throw new Error(`Error getting processing fee: ${error.message}`);
    }
  }
}

module.exports = CampaignPaymentMethod;
