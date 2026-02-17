const OrderModel = require('../models/order.model');
const LocationModel = require('../../../shared/models/location.model');

class OrderService {
  /**
   * Create new order
   */
  static async createOrder(orderData, customerId) {
    // Validate required fields
    const requiredFields = ['title', 'description', 'category', 'store_name', 
      'store_location', 'delivery_location', 'estimated_item_cost'];
    
    for (const field of requiredFields) {
      if (!orderData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    // Validate category
    const validCategories = ['groceries', 'electronics', 'documents', 'medicine', 'clothing', 'other'];
    if (!validCategories.includes(orderData.category)) {
      throw new Error('Invalid category');
    }

    // Validate locations have at least coordinates or address
    const storeLoc = orderData.store_location;
    const deliveryLoc = orderData.delivery_location;
    
    if (!storeLoc.latitude && !storeLoc.address) {
      throw new Error('Store location must have coordinates or address');
    }

    if (!deliveryLoc.latitude && !deliveryLoc.address) {
      throw new Error('Delivery location must have coordinates or address');
    }

    // Create store location
    const storeLocation = await LocationModel.create({
      latitude: storeLoc.latitude,
      longitude: storeLoc.longitude,
      address_line1: storeLoc.address,
      city: storeLoc.city,
      state: storeLoc.state,
      country: storeLoc.country || 'Nigeria',
      formatted_address: storeLoc.address,
      place_name: orderData.store_name,
      place_id: storeLoc.place_id,
      location_type: storeLoc.latitude ? 'gps' : 'manual',
      created_by: customerId
    });

    // Create delivery location
    const deliveryLocation = await LocationModel.create({
      latitude: deliveryLoc.latitude,
      longitude: deliveryLoc.longitude,
      address_line1: deliveryLoc.address,
      city: deliveryLoc.city,
      state: deliveryLoc.state,
      country: deliveryLoc.country || 'Nigeria',
      formatted_address: deliveryLoc.address,
      place_name: deliveryLoc.place_name,
      place_id: deliveryLoc.place_id,
      location_type: deliveryLoc.latitude ? 'gps' : 'manual',
      created_by: customerId
    });

    // Prepare order data
    const order = await OrderModel.create({
      customer_id: customerId,
      title: orderData.title,
      description: orderData.description,
      category: orderData.category,
      store_name: orderData.store_name,
      store_location_id: storeLocation.id,
      delivery_location_id: deliveryLocation.id,
      estimated_item_cost: orderData.estimated_item_cost,
      special_instructions: orderData.special_instructions,
      is_urgent: orderData.is_urgent || false,
      reference_photo_file_ids: orderData.reference_photo_file_ids || []
    });

    return order;
  }

  /**
   * Get order details
   */
  static async getOrderById(orderId, userId) {
    const order = await OrderModel.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    // Check access permissions
    const hasAccess = 
      order.customer_id === userId ||
      order.shopper_id === userId ||
      order.dispatcher_id === userId;

    if (!hasAccess) {
      throw new Error('Not authorized to view this order');
    }

    // Get photos
    const referencePhotos = await OrderModel.getReferencephotos(orderId);
    const progressPhotos = await OrderModel.getProgressPhotos(orderId);

    return {
      order,
      referencePhotos,
      progressPhotos
    };
  }

  /**
   * List orders where user is involved (customer, shopper, or dispatcher).
   * Permission-based: requires orders.view.
   */
  static async listOrders(userId, filters = {}, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const orders = await OrderModel.findByUserInvolved(userId, filters, limit, offset);
    const total = await OrderModel.countByUserInvolved(userId, filters);

    return {
      orders,
      total,
      page,
      limit
    };
  }

  /**
   * Get available orders (pending_shopper and pending_dispatcher) within radius.
   * Permission-based: requires orders.accept; any user with permission can accept as shopper or dispatcher.
   */
  static async getAvailableOrders(latitude, longitude, radius = 5, limit = 20) {
    const statuses = ['pending_shopper', 'pending_dispatcher'];
    return OrderModel.getAvailableOrders(statuses, latitude, longitude, radius, limit);
  }

  /**
   * Accept order as shopper or dispatcher based on order status.
   * Permission-based: requires orders.accept; assignment follows order state (pending_shopper → shopper, pending_dispatcher → dispatcher).
   */
  static async acceptOrder(orderId, userId) {
    const order = await OrderModel.findById(orderId);

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'pending_shopper') {
      await OrderModel.assignShopper(orderId, userId);
      await OrderModel.updateStatus(orderId, 'shopper_assigned', userId, 'Shopper accepted order');
      return { assignedAs: 'shopper' };
    }

    if (order.status === 'pending_dispatcher') {
      await OrderModel.assignDispatcher(orderId, userId);
      await OrderModel.updateStatus(orderId, 'dispatcher_assigned', userId, 'Dispatcher accepted order');
      return { assignedAs: 'dispatcher' };
    }

    throw new Error('Order is not available for acceptance');
  }

  /**
   * Upload progress photo
   */
  static async uploadProgressPhoto(orderId, fileId, stage, uploadedBy, caption = null) {
    const order = await OrderModel.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    // Verify uploader is shopper or dispatcher
    if (order.shopper_id !== uploadedBy && order.dispatcher_id !== uploadedBy) {
      throw new Error('Only assigned shopper or dispatcher can upload photos');
    }

    // Validate stage
    const validStages = ['item_found', 'receipt', 'handoff', 'delivery'];
    if (!validStages.includes(stage)) {
      throw new Error('Invalid photo stage');
    }

    const photo = await OrderModel.addProgressPhoto(orderId, fileId, stage, uploadedBy, caption);
    return photo;
  }

  /**
   * Update item cost (shopper)
   */
  static async updateItemCost(orderId, actualCost, items, userId) {
    const order = await OrderModel.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.shopper_id !== userId) {
      throw new Error('Only assigned shopper can update cost');
    }

    if (order.status !== 'in_shopping' && order.status !== 'shopping_completed') {
      throw new Error('Cannot update cost in current order status');
    }

    await OrderModel.updateCost(orderId, actualCost, items);
    return true;
  }

  /**
   * Cancel order
   */
  static async cancelOrder(orderId, userId, reason) {
    const order = await OrderModel.findById(orderId);
    
    if (!order) {
      throw new Error('Order not found');
    }

    // Only customer can cancel
    if (order.customer_id !== userId) {
      throw new Error('Only customer can cancel order');
    }

    // Check if cancellation is allowed
    const nonCancellableStatuses = ['in_transit', 'delivered', 'completed', 'cancelled'];
    if (nonCancellableStatuses.includes(order.status)) {
      throw new Error('Order cannot be cancelled in current status');
    }

    await OrderModel.cancel(orderId, userId, reason);
    await OrderModel.updateStatus(orderId, 'cancelled', userId, reason);
    
    return true;
  }
}

module.exports = OrderService;

