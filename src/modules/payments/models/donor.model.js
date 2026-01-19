const pool = require('../../../db/pool');

class Donor {
  constructor() {
    this.tableName = 'donors';
  }

  // Create a new donor
  async create(donorData) {
    const {
      first_name,
      last_name,
      email,
      phone,
      user_id,
      total_donated = 0,
      total_payments = 0,
      first_donation_date,
      last_donation_date,
      is_anonymous = false,
      marketing_consent = false,
      receipt_preference = 'email',
      address_street,
      address_city,
      address_state,
      address_country,
      address_zip_code,
      is_active = true,
      is_blocked = false,
      notes
    } = donorData;

    const query = `
      INSERT INTO donors (
        first_name, last_name, email, phone, user_id, total_donated, total_payments,
        first_donation_date, last_donation_date, is_anonymous, marketing_consent,
        receipt_preference, address_street, address_city, address_state,
        address_country, address_zip_code, is_active, is_blocked, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
      RETURNING *
    `;

    const values = [
      first_name, last_name, email, phone, user_id, total_donated, total_payments,
      first_donation_date, last_donation_date, is_anonymous, marketing_consent,
      receipt_preference, address_street, address_city, address_state,
      address_country, address_zip_code, is_active, is_blocked, notes
    ];

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error creating donor: ${error.message}`);
    }
  }

  // Find donor by ID
  async findById(id) {
    const query = 'SELECT * FROM donors WHERE id = $1';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding donor: ${error.message}`);
    }
  }

  // Find donor by email
  async findByEmail(email) {
    const query = 'SELECT * FROM donors WHERE email = $1';
    try {
      const result = await pool.query(query, [email]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding donor: ${error.message}`);
    }
  }

  // Find donor by user ID
  async findByUserId(userId) {
    const query = 'SELECT * FROM donors WHERE user_id = $1';
    try {
      const result = await pool.query(query, [userId]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error finding donor: ${error.message}`);
    }
  }

  // Get all donors with filters
  async findAll(options = {}) {
    const {
      limit = 50,
      offset = 0,
      is_active,
      is_anonymous,
      marketing_consent,
      min_total_donated,
      max_total_donated
    } = options;

    let query = 'SELECT * FROM donors WHERE 1=1';
    const values = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(is_active);
      paramIndex++;
    }

    if (is_anonymous !== undefined) {
      query += ` AND is_anonymous = $${paramIndex}`;
      values.push(is_anonymous);
      paramIndex++;
    }

    if (marketing_consent !== undefined) {
      query += ` AND marketing_consent = $${paramIndex}`;
      values.push(marketing_consent);
      paramIndex++;
    }

    if (min_total_donated) {
      query += ` AND total_donated >= $${paramIndex}`;
      values.push(min_total_donated);
      paramIndex++;
    }

    if (max_total_donated) {
      query += ` AND total_donated <= $${paramIndex}`;
      values.push(max_total_donated);
      paramIndex++;
    }

    query += ' ORDER BY total_donated DESC LIMIT $' + paramIndex + ' OFFSET $' + (paramIndex + 1);
    values.push(limit, offset);

    try {
      const result = await pool.query(query, values);
      return result.rows;
    } catch (error) {
      throw new Error(`Error finding donors: ${error.message}`);
    }
  }

  // Update donor
  async update(id, updateData) {
    const allowedFields = [
      'first_name', 'last_name', 'email', 'phone', 'total_donated', 'total_payments',
      'first_donation_date', 'last_donation_date', 'is_anonymous', 'marketing_consent',
      'receipt_preference', 'address_street', 'address_city', 'address_state',
      'address_country', 'address_zip_code', 'is_active', 'is_blocked', 'notes'
    ];

    const updates = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updateData)) {
      if (allowedFields.includes(key)) {
        updates.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (updates.length === 0) {
      throw new Error('No valid fields to update');
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);

    const query = `
      UPDATE donors 
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}
      RETURNING *
    `;

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating donor: ${error.message}`);
    }
  }

  // Update donor donation totals
  async updateDonationTotals(id, amount, increment = true) {
    const operation = increment ? '+' : '-';
    const query = `
      UPDATE donors 
      SET 
        total_donated = total_donated ${operation} $1,
        total_payments = total_payments ${operation} 1,
        last_donation_date = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [amount, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error updating donor totals: ${error.message}`);
    }
  }

  // Set first donation date
  async setFirstDonationDate(id) {
    const query = `
      UPDATE donors 
      SET first_donation_date = CURRENT_TIMESTAMP
      WHERE id = $1 AND first_donation_date IS NULL
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error setting first donation date: ${error.message}`);
    }
  }

  // Get donor statistics
  async getStats(filters = {}) {
    const { is_active, is_anonymous } = filters;
    
    let query = `
      SELECT 
        COUNT(*) as total_donors,
        COUNT(CASE WHEN is_active = true THEN 1 END) as active_donors,
        COUNT(CASE WHEN is_anonymous = true THEN 1 END) as anonymous_donors,
        SUM(total_donated) as total_donations,
        AVG(total_donated) as average_donation,
        MAX(total_donated) as highest_donor,
        COUNT(CASE WHEN marketing_consent = true THEN 1 END) as marketing_consent_count
      FROM donors
      WHERE 1=1
    `;
    
    const values = [];
    let paramIndex = 1;

    if (is_active !== undefined) {
      query += ` AND is_active = $${paramIndex}`;
      values.push(is_active);
      paramIndex++;
    }

    if (is_anonymous !== undefined) {
      query += ` AND is_anonymous = $${paramIndex}`;
      values.push(is_anonymous);
      paramIndex++;
    }

    try {
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error getting donor stats: ${error.message}`);
    }
  }

  // Get top donors
  async getTopDonors(limit = 10) {
    const query = `
      SELECT 
        id, first_name, last_name, email, total_donated, total_payments,
        first_donation_date, last_donation_date
      FROM donors 
      WHERE is_active = true AND total_donated > 0
      ORDER BY total_donated DESC 
      LIMIT $1
    `;

    try {
      const result = await pool.query(query, [limit]);
      return result.rows;
    } catch (error) {
      throw new Error(`Error getting top donors: ${error.message}`);
    }
  }

  // Delete donor
  async delete(id) {
    const query = 'DELETE FROM donors WHERE id = $1 RETURNING *';
    try {
      const result = await pool.query(query, [id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error deleting donor: ${error.message}`);
    }
  }

  // Block/unblock donor
  async toggleBlock(id, blocked = true) {
    const query = `
      UPDATE donors 
      SET is_blocked = $1, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [blocked, id]);
      return result.rows[0];
    } catch (error) {
      throw new Error(`Error toggling donor block: ${error.message}`);
    }
  }
}

module.exports = new Donor(); 