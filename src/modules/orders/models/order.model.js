const pool = require('../../../db/pool');

class OrderModel {
  /**
   * Create new order
   */
  static async create(orderData) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      const {
        customer_id,
        title,
        description,
        category,
        store_name,
        store_location_id,
        delivery_location_id,
        estimated_item_cost,
        special_instructions,
        is_urgent,
        reference_photo_file_ids = []
      } = orderData;

      // Get location coordinates to calculate distance
      const storeLocResult = await client.query(
        'SELECT latitude, longitude FROM locations WHERE id = $1',
        [store_location_id]
      );
      const deliveryLocResult = await client.query(
        'SELECT latitude, longitude FROM locations WHERE id = $1',
        [delivery_location_id]
      );

      const storeLoc = storeLocResult.rows[0];
      const deliveryLoc = deliveryLocResult.rows[0];

      // Calculate fees
      const shopper_fee = Math.floor(estimated_item_cost * 0.10); // 10% of item cost
      
      // Calculate distance if both locations have coordinates
      let dispatcher_fee = 500; // Base fee
      if (storeLoc.latitude && storeLoc.longitude && deliveryLoc.latitude && deliveryLoc.longitude) {
        const distance_km = calculateDistance(
          storeLoc.latitude, storeLoc.longitude,
          deliveryLoc.latitude, deliveryLoc.longitude
        );
        dispatcher_fee = Math.floor(500 + (distance_km * 100)); // Base 500 + 100 per km
      }
      
      const platform_fee = Math.floor((estimated_item_cost + shopper_fee + dispatcher_fee) * 0.10); // 10% commission
      const total_cost = estimated_item_cost + shopper_fee + dispatcher_fee + platform_fee;

      // Create order
      const orderResult = await client.query(
        `INSERT INTO orders (
          customer_id, title, description, category,
          store_name, store_location_id, delivery_location_id,
          estimated_item_cost, shopper_fee, dispatcher_fee, platform_fee, total_cost,
          special_instructions, is_urgent, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        RETURNING *`,
        [
          customer_id, title, description, category,
          store_name, store_location_id, delivery_location_id,
          estimated_item_cost, shopper_fee, dispatcher_fee, platform_fee, total_cost,
          special_instructions, is_urgent, 'pending_payment'
        ]
      );

      const order = orderResult.rows[0];

      // Add reference photos if provided
      if (reference_photo_file_ids.length > 0) {
        for (let i = 0; i < reference_photo_file_ids.length; i++) {
          await client.query(
            `INSERT INTO order_reference_photos (order_id, file_id, display_order)
             VALUES ($1, $2, $3)`,
            [order.id, reference_photo_file_ids[i], i]
          );
        }
      }

      // Create timeline entry
      await client.query(
        `INSERT INTO order_timeline (order_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [order.id, 'pending_payment', customer_id, 'Order created']
      );

      await client.query('COMMIT');
      return order;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Find order by ID with full details
   */
  static async findById(orderId) {
    const result = await pool.query(
      `SELECT 
        o.*,
        -- Store location
        store_loc.latitude as store_latitude,
        store_loc.longitude as store_longitude,
        store_loc.formatted_address as store_address,
        store_loc.place_name as store_place_name,
        store_loc.city as store_city,
        store_loc.state as store_state,
        store_country.name as store_country,
        -- Delivery location
        delivery_loc.latitude as delivery_latitude,
        delivery_loc.longitude as delivery_longitude,
        delivery_loc.formatted_address as delivery_address,
        delivery_loc.place_name as delivery_place_name,
        delivery_loc.city as delivery_city,
        delivery_loc.state as delivery_state,
        delivery_country.name as delivery_country,
        -- Customer info
        c_prof.first_name as customer_first_name,
        c_prof.last_name as customer_last_name,
        c_user.phone as customer_phone,
        c_prof.profile_photo_url as customer_photo,
        c_prof.rating_average as customer_rating,
        -- Shopper info
        s_prof.first_name as shopper_first_name,
        s_prof.last_name as shopper_last_name,
        s_user.phone as shopper_phone,
        s_prof.profile_photo_url as shopper_photo,
        s_prof.rating_average as shopper_rating,
        -- Dispatcher info
        d_prof.first_name as dispatcher_first_name,
        d_prof.last_name as dispatcher_last_name,
        d_user.phone as dispatcher_phone,
        d_prof.profile_photo_url as dispatcher_photo,
        d_prof.rating_average as dispatcher_rating
      FROM orders o
      LEFT JOIN locations store_loc ON o.store_location_id = store_loc.id
      LEFT JOIN countries store_country ON store_loc.country_id = store_country.id
      LEFT JOIN locations delivery_loc ON o.delivery_location_id = delivery_loc.id
      LEFT JOIN countries delivery_country ON delivery_loc.country_id = delivery_country.id
      LEFT JOIN users c_user ON o.customer_id = c_user.id
      LEFT JOIN profiles c_prof ON o.customer_id = c_prof.user_id
      LEFT JOIN users s_user ON o.shopper_id = s_user.id
      LEFT JOIN profiles s_prof ON o.shopper_id = s_prof.user_id
      LEFT JOIN users d_user ON o.dispatcher_id = d_user.id
      LEFT JOIN profiles d_prof ON o.dispatcher_id = d_prof.user_id
      WHERE o.id = $1`,
      [orderId]
    );

    return result.rows[0];
  }

  /**
   * Get reference photos for order
   */
  static async getReferencephotos(orderId) {
    const result = await pool.query(
      `SELECT f.id as file_id, f.file_url, f.file_type, f.file_size
       FROM order_reference_photos orp
       JOIN files f ON orp.file_id = f.id
       WHERE orp.order_id = $1 AND f.deleted_at IS NULL
       ORDER BY orp.display_order`,
      [orderId]
    );
    return result.rows;
  }

  /**
   * Get progress photos for order
   */
  static async getProgressPhotos(orderId) {
    const result = await pool.query(
      `SELECT 
        opp.id as photo_id,
        f.id as file_id,
        f.file_url,
        f.file_type,
        opp.stage,
        opp.caption,
        opp.uploaded_by,
        p.first_name,
        p.last_name,
        opp.uploaded_at
       FROM order_progress_photos opp
       JOIN files f ON opp.file_id = f.id
       LEFT JOIN profiles p ON opp.uploaded_by = p.user_id
       WHERE opp.order_id = $1 AND f.deleted_at IS NULL
       ORDER BY opp.uploaded_at`,
      [orderId]
    );
    return result.rows;
  }

  /**
   * Find orders for user (customer or service provider)
   */
  static async findByUser(userId, role, filters = {}, limit = 20, offset = 0) {
    let whereClause = '';
    const params = [userId];
    
    if (role === 'customer') {
      whereClause = 'WHERE o.customer_id = $1';
    } else if (role === 'shopper') {
      whereClause = 'WHERE o.shopper_id = $1';
    } else if (role === 'dispatcher') {
      whereClause = 'WHERE o.dispatcher_id = $1';
    }

    // Add status filter if provided
    if (filters.status) {
      params.push(filters.status);
      whereClause += ` AND o.status = $${params.length}`;
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT 
        o.id, o.title, o.category, o.status, o.store_name,
        o.total_cost as estimated_total, o.is_urgent, o.created_at,
        s_prof.first_name as shopper_first_name,
        s_prof.last_name as shopper_last_name,
        d_prof.first_name as dispatcher_first_name,
        d_prof.last_name as dispatcher_last_name
      FROM orders o
      LEFT JOIN profiles s_prof ON o.shopper_id = s_prof.user_id
      LEFT JOIN profiles d_prof ON o.dispatcher_id = d_prof.user_id
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return result.rows;
  }

  /**
   * Get available orders (for shoppers/dispatchers)
   */
  static async getAvailableOrders(role, latitude, longitude, radius = 5, limit = 20) {
    let status = role === 'shopper' ? 'pending_shopper' : 'pending_dispatcher';
    
    const result = await pool.query(
      `SELECT 
        o.id, o.title, o.description, o.category,
        o.store_name, o.store_address, o.store_latitude, o.store_longitude,
        o.delivery_address, o.delivery_latitude, o.delivery_longitude,
        o.estimated_item_cost, o.is_urgent, o.created_at,
        o.shopper_fee, o.dispatcher_fee,
        o.special_instructions,
        -- Calculate distance (simple approximation)
        (6371 * acos(cos(radians($1)) * cos(radians(o.store_latitude)) * 
         cos(radians(o.store_longitude) - radians($2)) + 
         sin(radians($1)) * sin(radians(o.store_latitude)))) as distance_km
      FROM orders o
      WHERE o.status = $3
      AND (6371 * acos(cos(radians($1)) * cos(radians(o.store_latitude)) * 
           cos(radians(o.store_longitude) - radians($2)) + 
           sin(radians($1)) * sin(radians(o.store_latitude)))) <= $4
      ORDER BY o.created_at DESC
      LIMIT $5`,
      [latitude, longitude, status, radius, limit]
    );

    return result.rows;
  }

  /**
   * Update order status
   */
  static async updateStatus(orderId, newStatus, userId, notes = null) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update order status
      const statusField = `${newStatus}_at`;
      const updateFields = ['status = $1', 'updated_at = NOW()'];
      const params = [newStatus, orderId];

      // Update specific timestamp fields based on status
      const timestampFields = {
        'pending_payment': null,
        'pending_shopper': 'payment_completed_at',
        'shopper_assigned': 'shopper_assigned_at',
        'in_shopping': 'shopping_started_at',
        'shopping_completed': 'shopping_completed_at',
        'pending_dispatcher': null,
        'dispatcher_assigned': 'dispatcher_assigned_at',
        'in_transit': 'delivery_started_at',
        'delivered': 'delivered_at',
        'completed': 'completed_at',
        'cancelled': 'cancelled_at'
      };

      if (timestampFields[newStatus]) {
        updateFields.push(`${timestampFields[newStatus]} = NOW()`);
      }

      await client.query(
        `UPDATE orders SET ${updateFields.join(', ')} WHERE id = $2`,
        params
      );

      // Add timeline entry
      await client.query(
        `INSERT INTO order_timeline (order_id, status, changed_by, notes)
         VALUES ($1, $2, $3, $4)`,
        [orderId, newStatus, userId, notes]
      );

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Assign shopper to order
   */
  static async assignShopper(orderId, shopperId) {
    await pool.query(
      `UPDATE orders 
       SET shopper_id = $1, status = 'shopper_assigned', shopper_assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [shopperId, orderId]
    );
  }

  /**
   * Assign dispatcher to order
   */
  static async assignDispatcher(orderId, dispatcherId) {
    await pool.query(
      `UPDATE orders 
       SET dispatcher_id = $1, status = 'dispatcher_assigned', dispatcher_assigned_at = NOW(), updated_at = NOW()
       WHERE id = $2`,
      [dispatcherId, orderId]
    );
  }

  /**
   * Add progress photo to order
   */
  static async addProgressPhoto(orderId, fileId, stage, uploadedBy, caption = null) {
    const result = await pool.query(
      `INSERT INTO order_progress_photos (order_id, file_id, stage, uploaded_by, caption)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [orderId, fileId, stage, uploadedBy, caption]
    );
    return result.rows[0];
  }

  /**
   * Update actual item cost
   */
  static async updateCost(orderId, actualCost, items = []) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update order cost
      await client.query(
        `UPDATE orders 
         SET actual_item_cost = $1, updated_at = NOW()
         WHERE id = $2`,
        [actualCost, orderId]
      );

      // Add items breakdown if provided
      if (items.length > 0) {
        for (const item of items) {
          await client.query(
            `INSERT INTO order_items (order_id, item_name, quantity, unit_price, total_price, notes)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [orderId, item.name, item.quantity, item.unit_price, item.total_price, item.notes]
          );
        }
      }

      await client.query('COMMIT');
      return true;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel order
   */
  static async cancel(orderId, cancelledBy, reason) {
    await pool.query(
      `UPDATE orders 
       SET status = 'cancelled', cancelled_at = NOW(), cancelled_by = $1, cancellation_reason = $2, updated_at = NOW()
       WHERE id = $3`,
      [cancelledBy, reason, orderId]
    );
  }

  /**
   * Count orders
   */
  static async count(filters = {}) {
    let whereClause = 'WHERE 1=1';
    const params = [];

    if (filters.customer_id) {
      params.push(filters.customer_id);
      whereClause += ` AND customer_id = $${params.length}`;
    }

    if (filters.status) {
      params.push(filters.status);
      whereClause += ` AND status = $${params.length}`;
    }

    const result = await pool.query(
      `SELECT COUNT(*) FROM orders ${whereClause}`,
      params
    );
    
    return parseInt(result.rows[0].count);
  }
}

// Helper function to calculate distance between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees) {
  return degrees * (Math.PI / 180);
}

module.exports = OrderModel;

