const pool = require('../../../db/pool');

/**
 * Site Page Usage Model
 * Tracks page usage per site based on subscription plan limits
 */
class SitePageUsageModel {
  /**
   * Create or update page usage for a site
   */
  static async upsert(siteId, usageData) {
    const {
      page_count,
      plan_limit,
      additional_pages = 0
    } = usageData;

    const result = await pool.query(
      `INSERT INTO site_page_usage (site_id, page_count, plan_limit, additional_pages, last_updated)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (site_id) 
       DO UPDATE SET 
         page_count = EXCLUDED.page_count,
         plan_limit = EXCLUDED.plan_limit,
         additional_pages = EXCLUDED.additional_pages,
         last_updated = CURRENT_TIMESTAMP
       RETURNING *`,
      [siteId, page_count, plan_limit, additional_pages]
    );

    return result.rows[0];
  }

  /**
   * Get page usage by site ID
   */
  static async findBySiteId(siteId) {
    const result = await pool.query(
      'SELECT * FROM site_page_usage WHERE site_id = $1',
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Update page count for a site
   */
  static async updatePageCount(siteId, pageCount) {
    const result = await pool.query(
      `UPDATE site_page_usage 
       SET page_count = $1, last_updated = CURRENT_TIMESTAMP
       WHERE site_id = $2
       RETURNING *`,
      [pageCount, siteId]
    );
    return result.rows[0];
  }

  /**
   * Update plan limit for a site
   */
  static async updatePlanLimit(siteId, planLimit) {
    const result = await pool.query(
      `UPDATE site_page_usage 
       SET plan_limit = $1, last_updated = CURRENT_TIMESTAMP
       WHERE site_id = $2
       RETURNING *`,
      [planLimit, siteId]
    );
    return result.rows[0];
  }

  /**
   * Increment page count
   */
  static async incrementPageCount(siteId) {
    const result = await pool.query(
      `UPDATE site_page_usage 
       SET page_count = page_count + 1, last_updated = CURRENT_TIMESTAMP
       WHERE site_id = $1
       RETURNING *`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Decrement page count
   */
  static async decrementPageCount(siteId) {
    const result = await pool.query(
      `UPDATE site_page_usage 
       SET page_count = GREATEST(page_count - 1, 0), last_updated = CURRENT_TIMESTAMP
       WHERE site_id = $1
       RETURNING *`,
      [siteId]
    );
    return result.rows[0];
  }

  /**
   * Check if site can add more pages
   */
  static async canAddPage(siteId) {
    const usage = await this.findBySiteId(siteId);
    if (!usage) {
      // If no usage record exists, allow it (will be created later)
      return { canAdd: true, reason: null };
    }

    const { page_count, plan_limit, additional_pages } = usage;
    const totalLimit = plan_limit + additional_pages;

    if (page_count < totalLimit) {
      return { canAdd: true, reason: null };
    }

    return {
      canAdd: false,
      reason: `Page limit reached (${page_count}/${totalLimit}). Upgrade your plan to add more pages.`
    };
  }

  /**
   * Get usage statistics
   */
  static async getStats() {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_sites,
        SUM(page_count) as total_pages,
        SUM(CASE WHEN page_count > plan_limit THEN 1 ELSE 0 END) as sites_over_limit,
        AVG(page_count) as average_pages_per_site,
        MAX(page_count) as max_pages
      FROM site_page_usage
    `);
    return result.rows[0];
  }

  /**
   * Get sites over their plan limit
   */
  static async getSitesOverLimit(limit = 50, offset = 0) {
    const result = await pool.query(
      `SELECT 
        spu.*,
        s.name as site_name,
        s.slug as site_slug,
        s.owner_id,
        us.plan_type
       FROM site_page_usage spu
       INNER JOIN sites s ON s.id = spu.site_id
       LEFT JOIN user_subscriptions us ON us.user_id = s.owner_id AND us.status = 'active'
       WHERE spu.page_count > (spu.plan_limit + COALESCE(spu.additional_pages, 0))
       ORDER BY (spu.page_count - (spu.plan_limit + COALESCE(spu.additional_pages, 0))) DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  }
}

module.exports = SitePageUsageModel;

