const pool = require('../../../db/pool');
const sendEmail = require('../../../shared/utils/sendEmail');

class EarlyAdopterService {
  /**
   * Create early adopter record
   */
  static async createEarlyAdopter(data) {
    const { name, email, business_name, ip_address, user_agent } = data;

    // Check if email already exists
    const existingCheck = await pool.query(
      'SELECT id FROM early_adopters WHERE email = $1',
      [email]
    );

    if (existingCheck.rows.length > 0) {
      throw new Error('Email already registered as an early adopter');
    }

    // Insert new early adopter
    const result = await pool.query(
      `INSERT INTO early_adopters (name, email, business_name, ip_address, user_agent, status, created_at)
       VALUES ($1, $2, $3, $4, $5, 'pending', NOW())
       RETURNING *`,
      [name, email, business_name, ip_address || null, user_agent || null]
    );

    return result.rows[0];
  }

  /**
   * Send notification email to rasheedsaidi@gmail.com
   */
  static async sendNotificationEmail(data) {
    const { name, email, business_name } = data;
    const notificationEmail = 'rasheedsaidi@gmail.com';
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartstore.ng';

    // Format submitted time
    const submittedAt = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short'
    });

    // Send email using the sendEmail utility with template
    await sendEmail({
      to: notificationEmail,
      subject: `🎉 New Early Adopter Application: ${business_name}`,
      templateFile: 'early-adopter-notification.html',
      placeholders: {
        name: name,
        email: email,
        business_name: business_name,
        submitted_at: submittedAt,
        dashboard_url: `${frontendUrl}/dashboard/admin/early-adopters`,
        year: new Date().getFullYear().toString()
      },
      fromEmail: process.env.FROM_EMAIL || 'noreply@smartstore.ng',
    });
  }

  /**
   * Get all early adopters with filters (admin only)
   */
  static async getAllEarlyAdopters(filters = {}) {
    const { status, search, page = 1, limit = 50 } = filters;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM early_adopters WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      query += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      query += ` AND (
        name ILIKE $${paramIndex} OR 
        email ILIKE $${paramIndex} OR 
        business_name ILIKE $${paramIndex}
      )`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get early adopter by ID (admin only)
   */
  static async getEarlyAdopterById(id) {
    const result = await pool.query('SELECT * FROM early_adopters WHERE id = $1', [id]);
    return result.rows[0] || null;
  }

  /**
   * Update early adopter (admin only)
   */
  static async updateEarlyAdopter(id, updateData) {
    const { status, notes, contacted_at } = updateData;
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (status !== undefined) {
      updates.push(`status = $${paramIndex}`);
      params.push(status);
      paramIndex++;
    }

    if (notes !== undefined) {
      updates.push(`notes = $${paramIndex}`);
      params.push(notes);
      paramIndex++;
    }

    if (contacted_at !== undefined) {
      updates.push(`contacted_at = $${paramIndex}`);
      params.push(contacted_at);
      paramIndex++;
    }

    if (updates.length === 0) {
      // No updates to make, just return the current record
      return await this.getEarlyAdopterById(id);
    }

    updates.push(`updated_at = NOW()`);
    params.push(id);

    const query = `
      UPDATE early_adopters 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    const result = await pool.query(query, params);
    return result.rows[0] || null;
  }

  /**
   * Send welcome email to early adopter
   */
  static async sendWelcomeEmail(data) {
    const { name, email } = data;
    const frontendUrl = process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartstore.ng';
    const discordUrl = 'https://discord.gg/jD4UwTky';

    // Send email using the sendEmail utility with template
    await sendEmail({
      to: email,
      subject: 'Welcome to SmartStore Early Adopter Program! 🎉',
      templateFile: 'early-adopter-welcome.html',
      placeholders: {
        name: name,
        discord_url: discordUrl,
        dashboard_url: `${frontendUrl}/dashboard`,
        signup_url: `${frontendUrl}/auth/signup`,
        year: new Date().getFullYear().toString()
      },
      fromEmail: process.env.FROM_EMAIL || 'noreply@smartstore.ng',
    });
  }
}

module.exports = EarlyAdopterService;

