const OrderService = require('../services/order.service');
const LocationTrackingModel = require('../models/location-tracking.model');
const FileService = require('../../files/services/file.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { OK, CREATED, NOT_FOUND, FORBIDDEN, BAD_REQUEST } = require('../../../shared/constants/statusCodes');

class OrderController {
  /**
   * Create order
   */
  static async createOrder(req, res) {
    try {
      const customerId = req.user.user_id;
      const order = await OrderService.createOrder(req.body, customerId);
      
      sendSuccess(res, {
        order_id: order.id,
        status: order.status,
        created_at: order.created_at,
        financial: {
          estimated_item_cost: order.estimated_item_cost,
          shopper_fee: order.shopper_fee,
          dispatcher_fee: order.dispatcher_fee,
          platform_fee: order.platform_fee,
          estimated_total: order.total_cost
        },
        payment: {
          payment_required: true,
          payment_status: 'pending'
        }
      }, 'Order created successfully. Please proceed to payment.', CREATED);
    } catch (error) {
      if (error.message.includes('required') || error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get order details
   */
  static async getOrder(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      const { order, referencePhotos, progressPhotos } = await OrderService.getOrderById(orderId, userId);
      
      sendSuccess(res, {
        order_id: order.id,
        title: order.title,
        description: order.description,
        category: order.category,
        status: order.status,
        customer: {
          user_id: order.customer_id,
          first_name: order.customer_first_name,
          last_name: order.customer_last_name,
          phone: order.customer_phone,
          profile_photo: order.customer_photo,
          rating: order.customer_rating
        },
        shopper: order.shopper_id ? {
          user_id: order.shopper_id,
          first_name: order.shopper_first_name,
          last_name: order.shopper_last_name,
          phone: order.shopper_phone,
          profile_photo: order.shopper_photo,
          rating: order.shopper_rating,
          assigned_at: order.shopper_assigned_at
        } : null,
        dispatcher: order.dispatcher_id ? {
          user_id: order.dispatcher_id,
          first_name: order.dispatcher_first_name,
          last_name: order.dispatcher_last_name,
          phone: order.dispatcher_phone,
          profile_photo: order.dispatcher_photo,
          rating: order.dispatcher_rating,
          assigned_at: order.dispatcher_assigned_at
        } : null,
        store_location: {
          name: order.store_name,
          address: order.store_address,
          latitude: parseFloat(order.store_latitude),
          longitude: parseFloat(order.store_longitude)
        },
        delivery_location: {
          address: order.delivery_address,
          latitude: parseFloat(order.delivery_latitude),
          longitude: parseFloat(order.delivery_longitude)
        },
        financial: {
          estimated_item_cost: order.estimated_item_cost,
          actual_item_cost: order.actual_item_cost,
          shopper_fee: order.shopper_fee,
          dispatcher_fee: order.dispatcher_fee,
          platform_fee: order.platform_fee,
          total: order.total_cost
        },
        reference_photos: referencePhotos,
        progress_photos: progressPhotos,
        special_instructions: order.special_instructions,
        is_urgent: order.is_urgent,
        timeline: {
          created_at: order.created_at,
          payment_completed_at: order.payment_completed_at,
          shopper_assigned_at: order.shopper_assigned_at,
          shopping_started_at: order.shopping_started_at,
          shopping_completed_at: order.shopping_completed_at,
          dispatcher_assigned_at: order.dispatcher_assigned_at,
          pickup_completed_at: order.pickup_completed_at,
          delivery_started_at: order.delivery_started_at,
          delivered_at: order.delivered_at,
          cancelled_at: order.cancelled_at
        },
        created_at: order.created_at,
        updated_at: order.updated_at
      }, 'Order retrieved successfully', OK);
    } catch (error) {
      if (error.message === 'Order not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('Not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * List orders
   */
  static async listOrders(req, res) {
    try {
      const userId = req.user.user_id;
      const role = req.user.roles[0] || 'customer';
      const { status, page = 1, limit = 20 } = req.query;
      
      const filters = {};
      if (status) filters.status = status;

      const { orders, total } = await OrderService.listOrders(userId, role, filters, page, limit);
      
      sendPaginated(res, { orders }, page, limit, total);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get available orders (service providers)
   */
  static async getAvailableOrders(req, res) {
    try {
      const role = req.user.roles[0];
      const { latitude, longitude, radius = 5, limit = 20 } = req.query;
      
      if (!latitude || !longitude) {
        return sendError(res, 'Latitude and longitude are required', BAD_REQUEST);
      }

      const orders = await OrderService.getAvailableOrders(
        role, 
        parseFloat(latitude), 
        parseFloat(longitude), 
        parseFloat(radius),
        parseInt(limit)
      );
      
      sendSuccess(res, { 
        orders,
        total_available: orders.length 
      }, 'Available orders retrieved successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Accept order
   */
  static async acceptOrder(req, res) {
    try {
      const userId = req.user.user_id;
      const role = req.user.roles[0];
      const orderId = req.params.order_id;
      
      await OrderService.acceptOrder(orderId, userId, role);
      
      sendSuccess(res, {
        order_id: orderId,
        status: role === 'shopper' ? 'shopper_assigned' : 'dispatcher_assigned',
        your_role: role,
        assigned_at: new Date().toISOString()
      }, `Order accepted. Please proceed.`, OK);
    } catch (error) {
      if (error.message.includes('not available')) {
        return sendError(res, error.message, 409);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Upload progress photo
   */
  static async uploadProgressPhoto(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      const { file_id, stage, caption } = req.body;
      
      if (!file_id || !stage) {
        return sendError(res, 'file_id and stage are required', BAD_REQUEST);
      }

      const photo = await OrderService.uploadProgressPhoto(orderId, file_id, stage, userId, caption);
      
      sendSuccess(res, {
        photo_id: photo.id,
        file_id: photo.file_id,
        stage: photo.stage,
        uploaded_at: photo.uploaded_at
      }, 'Photo uploaded successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update item cost
   */
  static async updateCost(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      const { actual_cost, items_breakdown = [] } = req.body;
      
      if (!actual_cost) {
        return sendError(res, 'actual_cost is required', BAD_REQUEST);
      }

      await OrderService.updateItemCost(orderId, actual_cost, items_breakdown, userId);
      
      sendSuccess(res, {
        order_id: orderId,
        actual_cost: actual_cost
      }, 'Cost updated successfully', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Cancel order
   */
  static async cancelOrder(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      const { cancellation_reason } = req.body;
      
      if (!cancellation_reason) {
        return sendError(res, 'Cancellation reason is required', BAD_REQUEST);
      }

      await OrderService.cancelOrder(orderId, userId, cancellation_reason);
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'cancelled',
        cancelled_at: new Date().toISOString()
      }, 'Order cancelled successfully', OK);
    } catch (error) {
      if (error.message.includes('cannot be cancelled')) {
        return sendError(res, error.message, 400);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Start shopping
   */
  static async startShopping(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      await OrderModel.updateStatus(orderId, 'in_shopping', userId, 'Shopping started');
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'in_shopping',
        shopping_started_at: new Date().toISOString()
      }, 'Shopping started', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Mark ready for pickup
   */
  static async markReadyForPickup(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      await OrderModel.updateStatus(orderId, 'pending_dispatcher', userId, 'Ready for pickup');
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'pending_dispatcher',
        shopping_completed_at: new Date().toISOString()
      }, 'Order ready for pickup. Notifying dispatchers.', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Confirm pickup
   */
  static async confirmPickup(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      await OrderModel.updateStatus(orderId, 'in_transit', userId, 'Items picked up');
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'in_transit',
        pickup_completed_at: new Date().toISOString()
      }, 'Pickup confirmed. Please deliver to customer.', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Complete delivery
   */
  static async completeDelivery(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      await OrderModel.updateStatus(orderId, 'delivered', userId, 'Delivered to customer');
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'delivered',
        delivered_at: new Date().toISOString(),
        awaiting_customer_confirmation: true
      }, 'Delivery completed. Awaiting customer confirmation.', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Confirm delivery (customer)
   */
  static async confirmDelivery(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      
      await OrderModel.updateStatus(orderId, 'completed', userId, 'Customer confirmed delivery');
      
      sendSuccess(res, {
        order_id: orderId,
        status: 'completed',
        completed_at: new Date().toISOString(),
        rating_required: true
      }, 'Delivery confirmed. Please rate your experience.', OK);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update location
   */
  static async updateLocation(req, res) {
    try {
      const userId = req.user.user_id;
      const orderId = req.params.order_id;
      const locationData = {
        ...req.body,
        order_id: orderId,
        user_id: userId
      };

      const location = await LocationTrackingModel.addLocation(locationData);

      sendSuccess(res, {
        location_updated: true,
        timestamp: location.timestamp
      }, 'Location updated successfully', CREATED);
    } catch (error) {
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = OrderController;


