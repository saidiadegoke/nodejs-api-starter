/**
 * Location Model
 * 
 * Centralized location model for storing and managing location data
 * across the platform (addresses, orders, tracking, etc.)
 */

const pool = require('../../db/pool');

class LocationModel {
  /**
   * Create a new location
   */
  static async create(locationData) {
    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      heading,
      speed,
      address_line1,
      address_line2,
      city,
      state,
      country_id,
      country,                                   // For backward compatibility, convert to country_id
      postal_code,
      formatted_address,
      place_id,
      place_name,
      location_type = 'manual',
      ip_address,
      cell_tower_id,
      wifi_bssid,
      metadata,
      created_by
    } = locationData;

    // If country name is provided instead of country_id, look it up
    let finalCountryId = country_id;
    if (!finalCountryId && country) {
      const countryResult = await pool.query(
        'SELECT id FROM countries WHERE name = $1 OR iso_code_2 = $2 OR iso_code_3 = $3 LIMIT 1',
        [country, country, country]
      );
      if (countryResult.rows.length > 0) {
        finalCountryId = countryResult.rows[0].id;
      }
    }

    // Default to Nigeria if no country specified
    if (!finalCountryId) {
      const nigeriaResult = await pool.query(
        "SELECT id FROM countries WHERE iso_code_2 = 'NG' LIMIT 1"
      );
      if (nigeriaResult.rows.length > 0) {
        finalCountryId = nigeriaResult.rows[0].id;
      }
    }

    const result = await pool.query(
      `INSERT INTO locations (
        latitude, longitude, accuracy, altitude, heading, speed,
        address_line1, address_line2, city, state, country_id, postal_code,
        formatted_address, place_id, place_name, location_type,
        ip_address, cell_tower_id, wifi_bssid, metadata, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
      RETURNING *`,
      [
        latitude, longitude, accuracy, altitude, heading, speed,
        address_line1, address_line2, city, state, finalCountryId, postal_code,
        formatted_address, place_id, place_name, location_type,
        ip_address, cell_tower_id, wifi_bssid, metadata ? JSON.stringify(metadata) : null, created_by
      ]
    );

    return result.rows[0];
  }

  /**
   * Get location by ID
   */
  static async getById(locationId) {
    const result = await pool.query(
      'SELECT * FROM locations WHERE id = $1',
      [locationId]
    );

    return result.rows[0];
  }

  /**
   * Update location
   */
  static async update(locationId, updateData) {
    const {
      latitude,
      longitude,
      accuracy,
      altitude,
      heading,
      speed,
      address_line1,
      address_line2,
      city,
      state,
      country_id,
      country,
      postal_code,
      formatted_address,
      place_id,
      place_name,
      location_type,
      metadata
    } = updateData;

    // If country name is provided instead of country_id, look it up
    let finalCountryId = country_id;
    if (!finalCountryId && country) {
      const countryResult = await pool.query(
        'SELECT id FROM countries WHERE name = $1 OR iso_code_2 = $2 OR iso_code_3 = $3 LIMIT 1',
        [country, country, country]
      );
      if (countryResult.rows.length > 0) {
        finalCountryId = countryResult.rows[0].id;
      }
    }

    const result = await pool.query(
      `UPDATE locations SET
        latitude = COALESCE($1, latitude),
        longitude = COALESCE($2, longitude),
        accuracy = COALESCE($3, accuracy),
        altitude = COALESCE($4, altitude),
        heading = COALESCE($5, heading),
        speed = COALESCE($6, speed),
        address_line1 = COALESCE($7, address_line1),
        address_line2 = COALESCE($8, address_line2),
        city = COALESCE($9, city),
        state = COALESCE($10, state),
        country_id = COALESCE($11, country_id),
        postal_code = COALESCE($12, postal_code),
        formatted_address = COALESCE($13, formatted_address),
        place_id = COALESCE($14, place_id),
        place_name = COALESCE($15, place_name),
        location_type = COALESCE($16, location_type),
        metadata = COALESCE($17, metadata),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = $18
      RETURNING *`,
      [
        latitude, longitude, accuracy, altitude, heading, speed,
        address_line1, address_line2, city, state, finalCountryId, postal_code,
        formatted_address, place_id, place_name, location_type,
        metadata ? JSON.stringify(metadata) : null, locationId
      ]
    );

    return result.rows[0];
  }

  /**
   * Find nearby locations
   */
  static async findNearby(latitude, longitude, radiusKm = 5, limit = 10) {
    // Using Haversine formula for distance calculation
    const result = await pool.query(
      `SELECT *,
        (
          6371 * acos(
            cos(radians($1)) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($2)) +
            sin(radians($1)) * sin(radians(latitude))
          )
        ) AS distance_km
      FROM locations
      WHERE latitude IS NOT NULL AND longitude IS NOT NULL
      HAVING distance_km <= $3
      ORDER BY distance_km
      LIMIT $4`,
      [latitude, longitude, radiusKm, limit]
    );

    return result.rows;
  }

  /**
   * Delete location
   */
  static async delete(locationId) {
    await pool.query('DELETE FROM locations WHERE id = $1', [locationId]);
  }
}

module.exports = LocationModel;

