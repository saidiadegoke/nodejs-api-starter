const pool = require('../../../db/pool');

class Campaign {
  constructor() {
    this.tableName = 'campaigns';
  }

  // Create a new campaign
  async create(campaignData) {
    const {
      name,
      slug,
      description,
      type,
      target_amount,
      current_amount = 0,
      currency = 'NGN',
      status = 'active',
      is_public = true,
      allow_anonymous = true,
      min_amount,
      max_amount,
      suggested_amounts = [],
      start_date,
      end_date,
      image_url,
      gallery = [],
      short_description,
      long_description,
      total_donors = 0,
      total_payments = 0,
      created_by,
      requires_approval = false,
      categories = [],
      tags = []
    } = campaignData;

    const query = `
      INSERT INTO campaigns (
        name, slug, description, type, target_amount, current_amount, currency,
        status, is_public, allow_anonymous, min_amount, max_amount, suggested_amounts,
        start_date, end_date, image_url, gallery, short_description, long_description,
        total_donors, total_payments, created_by, requires_approval, categories, tags
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25)
      RETURNING *
    `;

    const values = [
      name, slug, description, type, target_amount, current_amount, currency,
      status, is_public, allow_anonymous, min_amount, max_amount, JSON.stringify(suggested_amounts),
      start_date, end_date, image_url, JSON.stringify(gallery), short_description, long_description,
      total_donors, total_payments, created_by, requires_approval, JSON.stringify(categories), JSON.stringify(tags)
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating campaign: ${error.message}`);
    }
  }

  // Find campaign by ID
  async findById(id) {
    const query = `
      SELECT 
        c.*,
        COALESCE((
          SELECT SUM(amount) 
          FROM payments 
          WHERE campaign_id = c.id 
          AND status = 'completed'
        ), 0) as calculated_current_amount,
        COALESCE((
          SELECT COUNT(*) 
          FROM payments 
          WHERE campaign_id = c.id
        ), 0) as calculated_total_payments,
        COALESCE((
          SELECT COUNT(DISTINCT donor_identifier)
          FROM (
            SELECT 
              CASE 
                WHEN donor_id IS NOT NULL THEN donor_id::text
                WHEN anonymous_donor_email IS NOT NULL THEN anonymous_donor_email
                ELSE NULL
              END as donor_identifier
            FROM payments 
            WHERE campaign_id = c.id
            AND (donor_id IS NOT NULL OR anonymous_donor_email IS NOT NULL)
          ) donor_subquery
        ), 0) as calculated_total_donors,
        CASE 
          WHEN c.end_date IS NOT NULL AND c.end_date < NOW() THEN 'ended'
          ELSE c.status
        END as computed_status
      FROM campaigns c 
      WHERE c.id = $1 AND c.deleted_at IS NULL
    `;
    try {
      const result = await pool.query(query, [id]);
      if (result.rows[0]) {
        const campaign = result.rows[0];
        // Use calculated values instead of stored values
        campaign.current_amount = parseFloat(campaign.calculated_current_amount);
        campaign.total_payments = parseInt(campaign.calculated_total_payments);
        campaign.total_donors = parseInt(campaign.calculated_total_donors);
        campaign.status = campaign.computed_status; // Use computed status based on end date
        return campaign;
      }
      return null;
    } catch (error) {
      throw new Error(`Error finding campaign: ${error.message}`);
    }
  }

  // Find campaign by slug
  async findBySlug(slug) {
    const query = `
      SELECT 
        c.*,
        COALESCE((
          SELECT SUM(amount) 
          FROM payments 
          WHERE campaign_id = c.id 
          AND status = 'completed'
        ), 0) as calculated_current_amount,
        COALESCE((
          SELECT COUNT(*) 
          FROM payments 
          WHERE campaign_id = c.id
        ), 0) as calculated_total_payments,
        COALESCE((
          SELECT COUNT(DISTINCT donor_identifier)
          FROM (
            SELECT 
              CASE 
                WHEN donor_id IS NOT NULL THEN donor_id::text
                WHEN anonymous_donor_email IS NOT NULL THEN anonymous_donor_email
                ELSE NULL
              END as donor_identifier
            FROM payments 
            WHERE campaign_id = c.id
            AND (donor_id IS NOT NULL OR anonymous_donor_email IS NOT NULL)
          ) donor_subquery
        ), 0) as calculated_total_donors,
        CASE 
          WHEN c.end_date IS NOT NULL AND c.end_date < NOW() THEN 'ended'
          ELSE c.status
        END as computed_status
      FROM campaigns c 
      WHERE c.slug = $1 AND c.deleted_at IS NULL
    `;
    try {
      const result = await pool.query(query, [slug]);
      if (result.rows[0]) {
        const campaign = result.rows[0];
        // Use calculated values instead of stored values
        campaign.current_amount = parseFloat(campaign.calculated_current_amount);
        campaign.total_payments = parseInt(campaign.calculated_total_payments);
        campaign.total_donors = parseInt(campaign.calculated_total_donors);
        campaign.status = campaign.computed_status; // Use computed status based on end date
        return campaign;
      }
      return null;
    } catch (error) {
      throw new Error(`Error finding campaign: ${error.message}`);
    }
  }

  // Check if slug exists (more efficient than findBySlug when only checking existence)
  async slugExists(slug) {
    const query = 'SELECT id FROM campaigns WHERE slug = $1 AND deleted_at IS NULL';
    try {
      const result = await pool.query(query, [slug]);
      return result.rows.length > 0;
    } catch (error) {
      throw new Error(`Error checking slug existence: ${error.message}`);
    }
  }

  // Get all existing slugs (for debugging)
  async getAllSlugs() {
    const query = 'SELECT slug FROM campaigns WHERE deleted_at IS NULL ORDER BY slug';
    try {
      const result = await pool.query(query);
      return result.rows.map(row => row.slug);
    } catch (error) {
      throw new Error(`Error getting all slugs: ${error.message}`);
    }
  }

  // Get active campaigns
  async getActiveCampaigns(options = {}) {
    const { limit = 20, offset = 0, type, is_public = true } = options;
    
    let whereClause = 'WHERE c.status = $1 AND c.is_public = $2 AND c.deleted_at IS NULL';
    const values = ['active', is_public];
    let paramIndex = 3;

    if (type) {
      whereClause += ` AND c.type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    const query = `
      SELECT 
        c.*,
        COALESCE((
          SELECT SUM(amount) 
          FROM payments 
          WHERE campaign_id = c.id 
          AND status = 'completed'
        ), 0) as calculated_current_amount,
        COALESCE((
          SELECT COUNT(*) 
          FROM payments 
          WHERE campaign_id = c.id
        ), 0) as calculated_total_payments,
        COALESCE((
          SELECT COUNT(DISTINCT donor_identifier)
          FROM (
            SELECT 
              CASE 
                WHEN donor_id IS NOT NULL THEN donor_id::text
                WHEN anonymous_donor_email IS NOT NULL THEN anonymous_donor_email
                ELSE NULL
              END as donor_identifier
            FROM payments 
            WHERE campaign_id = c.id
            AND (donor_id IS NOT NULL OR anonymous_donor_email IS NOT NULL)
          ) donor_subquery
        ), 0) as calculated_total_donors,
        CASE 
          WHEN c.end_date IS NOT NULL AND c.end_date < NOW() THEN 'ended'
          ELSE c.status
        END as computed_status
      FROM campaigns c
      ${whereClause}
      ORDER BY c.created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      
      // Use calculated values instead of stored values
      const campaigns = result.rows.map(campaign => ({
        ...campaign,
        current_amount: parseFloat(campaign.calculated_current_amount),
        total_payments: parseInt(campaign.calculated_total_payments),
        total_donors: parseInt(campaign.calculated_total_donors),
        status: campaign.computed_status // Use computed status based on end date
      }));
      
      return campaigns;
    } catch (error) {
      throw new Error(`Error getting active campaigns: ${error.message}`);
    }
  }

  // Get all campaigns with pagination and filters
  async findAll(options = {}) {
    const { limit = 50, offset = 0, status, type, is_public } = options;
    
    let whereClause = 'WHERE c.deleted_at IS NULL';
    const values = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND c.status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (type) {
      whereClause += ` AND c.type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    if (is_public !== undefined) {
      whereClause += ` AND c.is_public = $${paramIndex}`;
      values.push(is_public);
      paramIndex++;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaigns c ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get campaigns with pagination and calculated stats
    const query = `
      SELECT 
        c.*,
        COALESCE((
          SELECT SUM(amount) 
          FROM payments 
          WHERE campaign_id = c.id 
          AND status = 'completed'
        ), 0) as calculated_current_amount,
        COALESCE((
          SELECT COUNT(*) 
          FROM payments 
          WHERE campaign_id = c.id
        ), 0) as calculated_total_payments,
        COALESCE((
          SELECT COUNT(DISTINCT donor_identifier)
          FROM (
            SELECT 
              CASE 
                WHEN donor_id IS NOT NULL THEN donor_id::text
                WHEN anonymous_donor_email IS NOT NULL THEN anonymous_donor_email
                ELSE NULL
              END as donor_identifier
            FROM payments 
            WHERE campaign_id = c.id
            AND (donor_id IS NOT NULL OR anonymous_donor_email IS NOT NULL)
          ) donor_subquery
        ), 0) as calculated_total_donors,
        CASE 
          WHEN c.end_date IS NOT NULL AND c.end_date < NOW() THEN 'ended'
          ELSE c.status
        END as computed_status
      FROM campaigns c
      ${whereClause}
      ORDER BY 
        CASE 
          WHEN c.end_date IS NOT NULL AND c.end_date < NOW() THEN 1
          WHEN c.status = 'ended' THEN 1
          ELSE 0
        END ASC,
        c.created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const limitOffsetValues = [...values, limit, offset];
    const result = await pool.query(query, limitOffsetValues);
    
    // Use calculated values instead of stored values
    const campaigns = result.rows.map(campaign => ({
      ...campaign,
      current_amount: parseFloat(campaign.calculated_current_amount),
      total_payments: parseInt(campaign.calculated_total_payments),
      total_donors: parseInt(campaign.calculated_total_donors),
      status: campaign.computed_status // Use computed status based on end date
    }));
    
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      campaigns,
      total,
      page: currentPage,
      totalPages,
      limit
    };
  }

  // Get all campaigns with pagination and filters (including deleted ones for admin)
  async findAllIncludingDeleted(options = {}) {
    const { limit = 50, offset = 0, status, type, is_public, includeDeleted = false } = options;
    
    let whereClause = includeDeleted ? '' : 'WHERE deleted_at IS NULL';
    const values = [];
    let paramIndex = 1;

    if (status) {
      whereClause += whereClause ? ` AND status = $${paramIndex}` : `WHERE status = $${paramIndex}`;
      values.push(status);
      paramIndex++;
    }

    if (type) {
      whereClause += whereClause ? ` AND type = $${paramIndex}` : `WHERE type = $${paramIndex}`;
      values.push(type);
      paramIndex++;
    }

    if (is_public !== undefined) {
      whereClause += whereClause ? ` AND is_public = $${paramIndex}` : `WHERE is_public = $${paramIndex}`;
      values.push(is_public);
      paramIndex++;
    }

    if (!includeDeleted) {
      whereClause += whereClause ? ` AND deleted_at IS NULL` : `WHERE deleted_at IS NULL`;
    }

    // Get total count
    const countQuery = `SELECT COUNT(*) FROM campaigns ${whereClause}`;
    const countResult = await pool.query(countQuery, values);
    const total = parseInt(countResult.rows[0].count);

    // Get campaigns with pagination
    const query = `
      SELECT * FROM campaigns 
      ${whereClause}
      ORDER BY created_at DESC 
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    const limitOffsetValues = [...values, limit, offset];
    const result = await pool.query(query, limitOffsetValues);
    
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      campaigns: result.rows,
      total,
      page: currentPage,
      totalPages,
      limit
    };
  }

  // Update campaign
  async update(id, updateData) {
    const allowedFields = [
      'name', 'slug', 'description', 'type', 'target_amount', 'current_amount',
      'currency', 'status', 'is_public', 'allow_anonymous', 'min_amount',
      'max_amount', 'suggested_amounts', 'start_date', 'end_date', 'image_url',
      'gallery', 'short_description', 'long_description', 'requires_approval',
      'categories', 'tags', 'expense_breakdown_document'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE campaigns 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating campaign: ${error.message}`);
    }
  }

  // Update campaign totals
  async updateTotals(id, amount, increment = true) {
    const operation = increment ? '+' : '-';
    const query = `
      UPDATE campaigns 
      SET 
        current_amount = current_amount ${operation} $1,
        total_payments = total_payments ${operation} 1,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [amount, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating campaign totals: ${error.message}`);
    }
  }

  // Get campaign statistics
  async getStats(id) {
    const query = `
      SELECT 
        c.*,
        COUNT(DISTINCT CASE WHEN p.donor_id IS NOT NULL THEN p.donor_id END) + 
        COUNT(DISTINCT CASE WHEN p.donor_id IS NULL THEN p.anonymous_donor_email END) as unique_donors,
        AVG(p.amount) as average_donation,
        MAX(p.amount) as largest_donation,
        MIN(p.amount) as smallest_donation
      FROM campaigns c
      LEFT JOIN payments p ON c.id = p.campaign_id AND p.status = 'completed'
      WHERE c.id = $1 AND c.deleted_at IS NULL
      GROUP BY c.id, c.name, c.slug, c.target_amount, c.current_amount, c.total_payments
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting campaign stats: ${error.message}`);
    }
  }

  // Get campaign analytics
  async getAnalytics(id, timeframe = '30d') {
    const query = `
      SELECT 
        DATE_TRUNC('day', p.created_at) as date,
        COUNT(*) as payments_count,
        SUM(p.amount) as total_amount,
        AVG(p.amount) as average_amount
      FROM payments p
      WHERE p.campaign_id = $1 
        AND p.status = 'completed'
        AND p.created_at >= NOW() - INTERVAL '1 ${timeframe}'
      GROUP BY DATE_TRUNC('day', p.created_at)
      ORDER BY date DESC
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting campaign analytics: ${error.message}`);
    }
  }

  // Soft delete campaign
  async delete(id) {
    const query = 'UPDATE campaigns SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting campaign: ${error.message}`);
    }
  }

  // Restore soft-deleted campaign
  async restore(id) {
    const query = 'UPDATE campaigns SET deleted_at = NULL WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error restoring campaign: ${error.message}`);
    }
  }

  // Get soft-deleted campaigns (admin only)
  async getDeletedCampaigns(options = {}) {
    const { limit = 50, offset = 0 } = options;
    
    // Get total count
    const countQuery = 'SELECT COUNT(*) FROM campaigns WHERE deleted_at IS NOT NULL';
    const countResult = await pool.query(countQuery);
    const total = parseInt(countResult.rows[0].count);

    // Get soft-deleted campaigns with pagination
    const query = `
      SELECT * FROM campaigns 
      WHERE deleted_at IS NOT NULL
      ORDER BY deleted_at DESC 
      LIMIT $1 OFFSET $2
    `;
    
    const result = await pool.query(query, [limit, offset]);
    
    const totalPages = Math.ceil(total / limit);
    const currentPage = Math.floor(offset / limit) + 1;

    return {
      campaigns: result.rows,
      total,
      page: currentPage,
      totalPages,
      limit
    };
  }

  // Get campaign summary statistics
  async getSummaryStats() {
    const query = `
      SELECT 
        COUNT(*) as total_campaigns,
        COUNT(CASE WHEN status = 'active' THEN 1 END) as active_campaigns,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_campaigns,
        SUM(current_amount) as total_raised,
        AVG(current_amount) as average_raised
      FROM campaigns
      WHERE deleted_at IS NULL
    `;

    try {
      const result = await pool.query(query);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting campaign summary stats: ${error.message}`);
    }
  }

  // Get campaign with payment methods and bank accounts
  async getWithPaymentConfig(id) {
    const CampaignPaymentMethod = require('./campaign-payment-method.model');
    const CampaignBankAccount = require('./campaign-bank-account.model');

    try {
      const campaign = await this.findById(id);
      if (!campaign) {
        return null;
      }

      // Get payment methods
      const paymentMethods = await CampaignPaymentMethod.getByCampaignId(id);
      
      // Get bank accounts
      const bankAccounts = await CampaignBankAccount.getByCampaignId(id);

      return {
        ...campaign,
        paymentMethods,
        bankAccounts
      };
    } catch (error) {
      throw new Error(`Error getting campaign with payment config: ${error.message}`);
    }
  }

  // Get campaign with payment methods and bank accounts by slug
  async getBySlugWithPaymentConfig(slug) {
    const CampaignPaymentMethod = require('./campaign-payment-method.model');
    const CampaignBankAccount = require('./campaign-bank-account.model');

    try {
      const campaign = await this.findBySlug(slug);
      if (!campaign) {
        return null;
      }

      // Get payment methods
      const paymentMethods = await CampaignPaymentMethod.getByCampaignId(campaign.id);
      
      // Get bank accounts
      const bankAccounts = await CampaignBankAccount.getByCampaignId(campaign.id);

      return {
        ...campaign,
        paymentMethods,
        bankAccounts
      };
    } catch (error) {
      throw new Error(`Error getting campaign by slug with payment config: ${error.message}`);
    }
  }
}

module.exports = new Campaign(); 