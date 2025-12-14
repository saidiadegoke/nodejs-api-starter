const LocationTrackingModel = require('../models/location-tracking.model');
const OrderModel = require('../models/order.model');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, FORBIDDEN } = require('../../../shared/constants/statusCodes');

class LocationController {
  /**
   * Update location for order
   */
  static async updateLocation(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      // Verify user is assigned to this order
      const order = await OrderModel.findById(orderId);
      if (!order) {
        return sendError(res, 'Order not found', 404);
      }

      if (order.shopper_id !== userId && order.dispatcher_id !== userId) {
        return sendError(res, 'Only assigned shopper or dispatcher can update location', FORBIDDEN);
      }

      const {
        latitude,
        longitude,
        accuracy,
        heading,
        speed,
        altitude,
        address_text,
        place_name,
        status,
        notes,
        battery_level,
        network_type,
        timestamp,
        metadata
      } = req.body;

      // Validate: at least one location method provided
      if (!latitude && !address_text && !place_name) {
        return sendError(res, 'At least one location method (GPS, address, or place name) is required', BAD_REQUEST);
      }

      const location = await LocationTrackingModel.addLocation({
        order_id: orderId,
        user_id: userId,
        latitude,
        longitude,
        accuracy,
        altitude,
        heading,
        speed,
        location_type: latitude ? 'gps' : (address_text ? 'manual' : 'place'),
        address_text,
        place_name,
        status,
        notes,
        battery_level,
        network_type,
        timestamp,
        metadata
      });

      sendSuccess(res, {
        location_id: location.id,
        location_updated: true,
        timestamp: location.timestamp
      }, 'Location updated successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get current location for order
   */
  static async getCurrentLocation(req, res) {
    try {
      const orderId = req.params.order_id;
      
      const location = await LocationTrackingModel.getLatestLocation(orderId);
      
      if (!location) {
        return sendSuccess(res, {
          current_location: null,
          message: 'No location data available yet'
        }, 'Location retrieved', OK);
      }

      sendSuccess(res, {
        current_location: {
          latitude: location.latitude ? parseFloat(location.latitude) : null,
          longitude: location.longitude ? parseFloat(location.longitude) : null,
          accuracy: location.accuracy,
          address: location.address_text,
          place_name: location.place_name,
          status: location.status,
          updated_at: location.timestamp
        }
      }, 'Current location retrieved', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get location history
   */
  static async getLocationHistory(req, res) {
    try {
      const orderId = req.params.order_id;
      const { limit = 50 } = req.query;
      
      const history = await LocationTrackingModel.getLocationHistory(orderId, parseInt(limit));
      
      sendSuccess(res, {
        order_id: orderId,
        location_history: history.map(loc => ({
          latitude: loc.latitude ? parseFloat(loc.latitude) : null,
          longitude: loc.longitude ? parseFloat(loc.longitude) : null,
          accuracy: loc.accuracy,
          address: loc.address_text,
          place_name: loc.place_name,
          status: loc.status,
          notes: loc.notes,
          timestamp: loc.timestamp
        })),
        total: history.length
      }, 'Location history retrieved', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get location trail (for map polyline)
   */
  static async getLocationTrail(req, res) {
    try {
      const orderId = req.params.order_id;
      const { since } = req.query;
      
      const trail = await LocationTrackingModel.getLocationTrail(orderId, since);
      
      sendSuccess(res, {
        order_id: orderId,
        trail: trail.map(point => ({
          lat: parseFloat(point.latitude),
          lng: parseFloat(point.longitude),
          timestamp: point.timestamp,
          status: point.status
        })),
        total_points: trail.length
      }, 'Location trail retrieved', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = LocationController;


