/**
 * Country Model
 * 
 * Model for managing countries reference data
 */

const pool = require('../../db/pool');

class CountryModel {
  /**
   * Get all active countries
   */
  static async getAll(activeOnly = true) {
    const query = activeOnly 
      ? 'SELECT * FROM countries WHERE is_active = true ORDER BY name'
      : 'SELECT * FROM countries ORDER BY name';
    
    const result = await pool.query(query);
    return result.rows;
  }

  /**
   * Get country by ID
   */
  static async getById(countryId) {
    const result = await pool.query(
      'SELECT * FROM countries WHERE id = $1',
      [countryId]
    );
    return result.rows[0];
  }

  /**
   * Get country by ISO code
   */
  static async getByIsoCode(isoCode) {
    const result = await pool.query(
      'SELECT * FROM countries WHERE iso_code_2 = $1 OR iso_code_3 = $1 LIMIT 1',
      [isoCode.toUpperCase()]
    );
    return result.rows[0];
  }

  /**
   * Get country by name
   */
  static async getByName(name) {
    const result = await pool.query(
      'SELECT * FROM countries WHERE name ILIKE $1 LIMIT 1',
      [name]
    );
    return result.rows[0];
  }

  /**
   * Search countries by name
   */
  static async search(searchTerm) {
    const result = await pool.query(
      'SELECT * FROM countries WHERE name ILIKE $1 AND is_active = true ORDER BY name LIMIT 10',
      [`%${searchTerm}%`]
    );
    return result.rows;
  }

  /**
   * Get default country (Nigeria)
   */
  static async getDefault() {
    const result = await pool.query(
      "SELECT * FROM countries WHERE iso_code_2 = 'NG' LIMIT 1"
    );
    return result.rows[0];
  }

  /**
   * Create new country (admin only)
   */
  static async create(countryData) {
    const {
      name,
      iso_code_2,
      iso_code_3,
      phone_code,
      currency_code,
      currency_name,
      is_active = true
    } = countryData;

    const result = await pool.query(
      `INSERT INTO countries (
        name, iso_code_2, iso_code_3, phone_code, 
        currency_code, currency_name, is_active
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [name, iso_code_2, iso_code_3, phone_code, currency_code, currency_name, is_active]
    );

    return result.rows[0];
  }

  /**
   * Update country
   */
  static async update(countryId, updateData) {
    const {
      name,
      phone_code,
      currency_code,
      currency_name,
      is_active
    } = updateData;

    const result = await pool.query(
      `UPDATE countries SET
        name = COALESCE($1, name),
        phone_code = COALESCE($2, phone_code),
        currency_code = COALESCE($3, currency_code),
        currency_name = COALESCE($4, currency_name),
        is_active = COALESCE($5, is_active)
      WHERE id = $6
      RETURNING *`,
      [name, phone_code, currency_code, currency_name, is_active, countryId]
    );

    return result.rows[0];
  }
}

module.exports = CountryModel;

