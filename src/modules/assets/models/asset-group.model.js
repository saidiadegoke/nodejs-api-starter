const pool = require('../../../db/pool');

class AssetGroupModel {
  /**
   * Create a new asset group
   */
  static async create(groupData) {
    const {
      user_id,
      name,
      description,
      parent_id,
      color,
      icon,
      sort_order = 0
    } = groupData;

    const result = await pool.query(
      `INSERT INTO asset_groups (user_id, name, description, parent_id, color, icon, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [user_id, name, description || null, parent_id || null, color || null, icon || null, sort_order]
    );

    return result.rows[0];
  }

  /**
   * Get asset group by ID
   */
  static async findById(groupId) {
    const result = await pool.query(
      'SELECT * FROM asset_groups WHERE id = $1 AND deleted_at IS NULL',
      [groupId]
    );
    return result.rows[0];
  }

  /**
   * Get all asset groups for a user
   * @param {string} userId - User ID
   * @param {string|null} parentId - Optional parent ID to filter by
   * @returns {Promise<Array>} Array of asset groups
   */
  static async findByUserId(userId, parentId = null) {
    let query = 'SELECT * FROM asset_groups WHERE user_id = $1 AND deleted_at IS NULL';
    const params = [userId];

    if (parentId === null) {
      // Get root-level groups (parent_id IS NULL)
      query += ' AND parent_id IS NULL';
    } else if (parentId !== undefined) {
      // Get groups with specific parent
      query += ' AND parent_id = $2';
      params.push(parentId);
    }

    query += ' ORDER BY sort_order ASC, name ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Get asset group with asset count
   */
  static async findByIdWithCount(groupId) {
    const result = await pool.query(
      `SELECT 
        ag.*,
        COALESCE((
          SELECT COUNT(*) 
          FROM files 
          WHERE asset_group_id = ag.id 
            AND deleted_at IS NULL
        ), 0) as asset_count
       FROM asset_groups ag
       WHERE ag.id = $1 AND ag.deleted_at IS NULL`,
      [groupId]
    );
    return result.rows[0];
  }

  /**
   * Get all groups for a user with asset counts
   */
  static async findByUserIdWithCounts(userId, parentId = null) {
    let query = `
      SELECT 
        ag.*,
        COALESCE((
          SELECT COUNT(*) 
          FROM files 
          WHERE asset_group_id = ag.id 
            AND deleted_at IS NULL
        ), 0) as asset_count
      FROM asset_groups ag
      WHERE ag.user_id = $1 AND ag.deleted_at IS NULL
    `;
    const params = [userId];

    if (parentId === null) {
      query += ' AND ag.parent_id IS NULL';
    } else if (parentId !== undefined) {
      query += ' AND ag.parent_id = $2';
      params.push(parentId);
    }

    query += ' ORDER BY ag.sort_order ASC, ag.name ASC';

    const result = await pool.query(query, params);
    return result.rows;
  }

  /**
   * Update asset group
   */
  static async update(groupId, updates) {
    const {
      name,
      description,
      parent_id,
      color,
      icon,
      sort_order
    } = updates;

    const fields = [];
    const values = [];
    let paramCount = 1;

    if (name !== undefined) {
      fields.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (description !== undefined) {
      fields.push(`description = $${paramCount++}`);
      values.push(description);
    }
    if (parent_id !== undefined) {
      fields.push(`parent_id = $${paramCount++}`);
      values.push(parent_id);
    }
    if (color !== undefined) {
      fields.push(`color = $${paramCount++}`);
      values.push(color);
    }
    if (icon !== undefined) {
      fields.push(`icon = $${paramCount++}`);
      values.push(icon);
    }
    if (sort_order !== undefined) {
      fields.push(`sort_order = $${paramCount++}`);
      values.push(sort_order);
    }

    if (fields.length === 0) {
      return await this.findById(groupId);
    }

    values.push(groupId);
    const query = `
      UPDATE asset_groups 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount} AND deleted_at IS NULL
      RETURNING *
    `;

    const result = await pool.query(query, values);
    return result.rows[0];
  }

  /**
   * Soft delete asset group
   */
  static async softDelete(groupId) {
    const result = await pool.query(
      'UPDATE asset_groups SET deleted_at = NOW() WHERE id = $1 RETURNING *',
      [groupId]
    );
    return result.rows[0];
  }

  /**
   * Check if user owns the asset group
   */
  static async isOwner(groupId, userId) {
    const result = await pool.query(
      'SELECT id FROM asset_groups WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [groupId, userId]
    );
    return result.rows.length > 0;
  }

  /**
   * Get nested folder tree for a user
   * Returns all groups organized hierarchically
   */
  static async getFolderTree(userId) {
    // Get all groups for user
    const allGroups = await this.findByUserIdWithCounts(userId);

    // Build tree structure
    const groupMap = new Map();
    const rootGroups = [];

    // Create map of all groups
    allGroups.forEach(group => {
      groupMap.set(group.id, { ...group, children: [] });
    });

    // Build tree
    allGroups.forEach(group => {
      const groupNode = groupMap.get(group.id);
      if (group.parent_id && groupMap.has(group.parent_id)) {
        groupMap.get(group.parent_id).children.push(groupNode);
      } else {
        rootGroups.push(groupNode);
      }
    });

    return rootGroups;
  }
}

module.exports = AssetGroupModel;
