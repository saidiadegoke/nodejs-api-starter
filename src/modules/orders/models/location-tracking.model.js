const pool = require('../../../db/pool');
const LocationModel = require('../../../shared/models/location.model');

class LocationTrackingModel {
  /**
   * Add location update for order
   */
  static async addLocation(locationData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const {
        order_id,
        user_id,
        // GPS data (optional)
        latitude,
        longitude,
        accuracy,
        altitude,
        heading,
        speed,
        // Alternative location data
        location_type = 'gps',
        address_text,
        place_name,
        city,
        state,
        country,
        postal_code,
        place_id,
        // Network data
        ip_address,
        cell_tower_id,
        wifi_bssid,
        // Status
        status,
        notes,
        // Device info
        battery_level,
        network_type,
        is_background = false,
        metadata = {},
        // Timestamp
        timestamp
      } = locationData;

      // Create location record
      const location = await LocationModel.create({
        latitude,
        longitude,
        accuracy,
        altitude,
        heading,
        speed,
        address_line1: address_text,
        city,
        state,
        country,
        postal_code,
        formatted_address: address_text,
        place_name,
        place_id,
        location_type,
        ip_address,
        cell_tower_id,
        wifi_bssid,
        metadata,
        created_by: user_id
      });

      // Create tracking record referencing the location
      const result = await client.query(
        `INSERT INTO order_location_tracking (
          order_id, user_id, location_id,
          status, notes,
          battery_level, network_type, is_background, metadata,
          timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *`,
        [
          order_id, user_id, location.id,
          status, notes,
          battery_level, network_type, is_background, JSON.stringify(metadata),
          timestamp || new Date()
        ]
      );

      await client.query('COMMIT');
      
      // Return tracking data with location details
      return {
        ...result.rows[0],
        location
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get latest location for order
   */
  static async getLatestLocation(orderId) {
    const result = await pool.query(
      `SELECT 
        olt.*,
        l.latitude, l.longitude, l.accuracy, l.heading, l.speed,
        l.formatted_address, l.place_name, l.city, l.state, l.location_type
       FROM order_location_tracking olt
       JOIN locations l ON olt.location_id = l.id
       WHERE olt.order_id = $1
       ORDER BY olt.timestamp DESC
       LIMIT 1`,
      [orderId]
    );
    return result.rows[0];
  }

  /**
   * Get location history for order
   */
  static async getLocationHistory(orderId, limit = 50) {
    const result = await pool.query(
      `SELECT 
        olt.id, olt.status, olt.notes, olt.battery_level, 
        olt.network_type, olt.timestamp, olt.created_at,
        l.latitude, l.longitude, l.accuracy, l.heading, l.speed,
        l.location_type, l.formatted_address as address_text, 
        l.place_name
       FROM order_location_tracking olt
       JOIN locations l ON olt.location_id = l.id
       WHERE olt.order_id = $1
       ORDER BY olt.timestamp DESC
       LIMIT $2`,
      [orderId, limit]
    );
    return result.rows;
  }

  /**
   * Get location trail (path) for mapping
   */
  static async getLocationTrail(orderId, sinceTimestamp = null) {
    const params = [orderId];
    let whereClause = 'WHERE olt.order_id = $1 AND l.latitude IS NOT NULL';

    if (sinceTimestamp) {
      params.push(sinceTimestamp);
      whereClause += ` AND olt.timestamp > $${params.length}`;
    }

    const result = await pool.query(
      `SELECT l.latitude, l.longitude, olt.timestamp, olt.status
       FROM order_location_tracking olt
       JOIN locations l ON olt.location_id = l.id
       ${whereClause}
       ORDER BY olt.timestamp ASC`,
      params
    );
    return result.rows;
  }

  /**
   * Delete old tracking data (cleanup)
   */
  static async deleteOldTracking(daysOld = 90) {
    const result = await pool.query(
      `DELETE FROM order_location_tracking
       WHERE created_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING id`,
      []
    );
    return result.rowCount;
  }
}

module.exports = LocationTrackingModel;

