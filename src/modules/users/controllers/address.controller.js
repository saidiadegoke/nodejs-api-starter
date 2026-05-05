const pool = require('../../../db/pool');
const LocationModel = require('../../../shared/models/location.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, NOT_FOUND, BAD_REQUEST, CONFLICT } = require('../../../shared/constants/statusCodes');

class AddressController {
  /**
   * Get all addresses for current user
   */
  static async getAddresses(req, res) {
    try {
      const userId = req.user.user_id;
      
      const result = await pool.query(
        `SELECT 
          ua.id as address_id,
          ua.label,
          ua.delivery_instructions,
          ua.contact_name,
          ua.contact_phone,
          ua.is_default,
          ua.is_verified,
          ua.created_at,
          ua.last_used_at,
          l.latitude,
          l.longitude,
          l.address_line1,
          l.address_line2,
          l.city,
          l.state,
          l.country_id,
          c.name as country,
          c.iso_code_2 as country_code,
          l.postal_code,
          l.formatted_address as address,
          l.place_name,
          l.place_id
        FROM user_addresses ua
        JOIN locations l ON ua.location_id = l.id
        LEFT JOIN countries c ON l.country_id = c.id
        WHERE ua.user_id = $1 AND ua.deleted_at IS NULL
        ORDER BY ua.is_default DESC, ua.last_used_at DESC NULLS LAST, ua.created_at DESC`,
        [userId]
      );
      
      sendSuccess(res, { addresses: result.rows }, 'Addresses retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Add new address
   */
  static async addAddress(req, res) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const userId = req.user.user_id;
      const {
        label,
        address_line1,
        address_line2,
        city,
        state,
        country = 'Nigeria',
        postal_code,
        latitude,
        longitude,
        place_id,
        place_name,
        delivery_instructions,
        contact_name,
        contact_phone,
        is_default = false
      } = req.body;

      // Build formatted address
      const addressParts = [address_line1, address_line2, city, state, country].filter(Boolean);
      const formatted_address = addressParts.join(', ');

      // Create location first
      const location = await LocationModel.create({
        latitude,
        longitude,
        address_line1,
        address_line2,
        city,
        state,
        country,
        postal_code,
        formatted_address,
        place_id,
        place_name,
        location_type: latitude && longitude ? 'gps' : 'manual',
        created_by: userId
      });

      // If setting as default, unset other defaults
      if (is_default) {
        await client.query(
          'UPDATE user_addresses SET is_default = false WHERE user_id = $1',
          [userId]
        );
      }
      
      // Create address referencing the location
      const result = await client.query(
        `INSERT INTO user_addresses (
          user_id, location_id, label, delivery_instructions,
          contact_name, contact_phone, is_default
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING 
          id as address_id, label, is_default, created_at`,
        [userId, location.id, label, delivery_instructions, contact_name, contact_phone, is_default]
      );
      
      await client.query('COMMIT');
      
      // Return with location data
      const addressData = {
        ...result.rows[0],
        address: formatted_address,
        latitude,
        longitude
      };
      
      sendSuccess(res, addressData, 'Address added successfully', CREATED);
    } catch (error) {
      await client.query('ROLLBACK');
      sendError(res, error.message, BAD_REQUEST);
    } finally {
      client.release();
    }
  }

  /**
   * Update address
   */
  static async updateAddress(req, res) {
    try {
      const userId = req.user.user_id;
      const addressId = req.params.address_id;
      
      const address = mockAddresses.get(addressId);
      
      if (!address || address.user_id !== userId) {
        return sendError(res, 'Address not found', NOT_FOUND);
      }
      
      // Update address
      const updatedAddress = {
        ...address,
        ...req.body,
        user_id: userId,
        address_id: addressId
      };
      
      mockAddresses.set(addressId, updatedAddress);
      
      const { user_id, ...responseData } = updatedAddress;
      
      sendSuccess(res, responseData, 'Address updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete address
   */
  static async deleteAddress(req, res) {
    try {
      const userId = req.user.user_id;
      const addressId = req.params.address_id;
      
      const address = mockAddresses.get(addressId);
      
      if (!address || address.user_id !== userId) {
        return sendError(res, 'Address not found', NOT_FOUND);
      }
      
      // Delete address
      mockAddresses.delete(addressId);
      
      sendSuccess(res, null, 'Address deleted successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = AddressController;

