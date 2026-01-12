const pool = require('../../../db/pool');

/**
 * Component Model
 * 
 * Components are stored globally and can be:
 * - System components (is_system = true, managed by SmartStore)
 * - User-created components (is_system = false, created by users)
 * - Template-specific components (stored in template.config.components, reference global component by id)
 * 
 * Component implementations (React code) live in smartstore-app.
 * This model only stores component definitions/metadata.
 */
class ComponentModel {
  /**
   * Get all components (global component registry)
   */
  static async getAllComponents(filters = {}) {
    let query = `
      SELECT 
        id,
        name,
        type,
        component_type,
        base_component_type,
        category,
        description,
        config,
        is_system,
        created_by,
        created_at,
        updated_at
      FROM component_registry
      WHERE 1=1
    `;
    const params = [];
    let paramCount = 1;

    if (filters.isSystem !== undefined) {
      query += ` AND is_system = $${paramCount}`;
      params.push(filters.isSystem);
      paramCount++;
    }

    if (filters.type) {
      // Support filtering by multiple types
      if (Array.isArray(filters.type)) {
        const placeholders = filters.type.map((_, i) => `$${paramCount + i}`).join(', ');
        query += ` AND type IN (${placeholders})`;
        params.push(...filters.type);
        paramCount += filters.type.length;
      } else {
        query += ` AND type = $${paramCount}`;
        params.push(filters.type);
        paramCount++;
      }
    }

    if (filters.category) {
      query += ` AND category = $${paramCount}`;
      params.push(filters.category);
      paramCount++;
    }

    if (filters.search) {
      query += ` AND (name ILIKE $${paramCount} OR description ILIKE $${paramCount})`;
      params.push(`%${filters.search}%`);
      paramCount++;
    }

    query += ' ORDER BY is_system DESC, created_at DESC';

    const result = await pool.query(query, params);
    return result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.component_type, // Map component_type to type for component lookup (e.g., 'topnav', 'footer')
      componentType: row.type, // Keep original type as componentType (e.g., 'system', 'regular', 'composite')
      baseComponentType: row.base_component_type,
      category: row.category,
      description: row.description,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      isSystem: row.is_system,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: 'smartstore', // Default provider for all components
    }));
  }

  /**
   * Get component by ID
   */
  static async getComponentById(componentId) {
    const result = await pool.query(
      `SELECT 
        id,
        name,
        type,
        component_type,
        base_component_type,
        category,
        description,
        config,
        is_system,
        created_by,
        created_at,
        updated_at
      FROM component_registry 
      WHERE id = $1`,
      [componentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.component_type, // Map component_type to type for component lookup (e.g., 'topnav', 'footer')
      componentType: row.type, // Keep original type as componentType (e.g., 'system', 'regular', 'composite')
      baseComponentType: row.base_component_type,
      category: row.category,
      description: row.description,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
      isSystem: row.is_system,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      provider: 'smartstore', // Default provider for all components
    };
  }

  /**
   * Create component
   */
  static async createComponent(componentData, userId = null) {
    const {
      name,
      type, // 'system' | 'custom' | 'composite'
      componentType, // Maps to React component in smartstore-app (system) or custom name
      baseComponentType, // For custom components: references the system component it's based on
      category,
      description,
      config, // Full ComponentConfig object
      isSystem = false, // true = system component (has React impl), false = user-created
    } = componentData;

    const result = await pool.query(
      `INSERT INTO component_registry (
        name, type, component_type, base_component_type, category, description, config, is_system, created_by
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        name,
        type,
        componentType,
        baseComponentType || null,
        category || null,
        description || null,
        JSON.stringify(config || {}),
        isSystem,
        userId,
      ]
    );

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      componentType: row.component_type,
      baseComponentType: row.base_component_type,
      category: row.category,
      description: row.description,
      isSystem: row.is_system,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    };
  }

  /**
   * Update component
   */
  static async updateComponent(componentId, componentData, userId = null) {
    const updates = [];
    const params = [];
    let paramCount = 1;

    if (componentData.name !== undefined) {
      updates.push(`name = $${paramCount}`);
      params.push(componentData.name);
      paramCount++;
    }
    if (componentData.type !== undefined) {
      updates.push(`type = $${paramCount}`);
      params.push(componentData.type);
      paramCount++;
    }
    if (componentData.componentType !== undefined) {
      updates.push(`component_type = $${paramCount}`);
      params.push(componentData.componentType);
      paramCount++;
    }
    if (componentData.baseComponentType !== undefined) {
      updates.push(`base_component_type = $${paramCount}`);
      params.push(componentData.baseComponentType);
      paramCount++;
    }
    if (componentData.category !== undefined) {
      updates.push(`category = $${paramCount}`);
      params.push(componentData.category);
      paramCount++;
    }
    if (componentData.description !== undefined) {
      updates.push(`description = $${paramCount}`);
      params.push(componentData.description);
      paramCount++;
    }
    if (componentData.config !== undefined) {
      updates.push(`config = $${paramCount}`);
      params.push(JSON.stringify(componentData.config));
      paramCount++;
    }
    if (componentData.isSystem !== undefined) {
      updates.push(`is_system = $${paramCount}`);
      params.push(componentData.isSystem);
      paramCount++;
    }

    if (updates.length === 0) {
      return await this.getComponentById(componentId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    params.push(componentId);
    const result = await pool.query(
      `UPDATE component_registry 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      params
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      componentType: row.component_type,
      baseComponentType: row.base_component_type,
      category: row.category,
      description: row.description,
      isSystem: row.is_system,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    };
  }

  /**
   * Delete component (only user-created, not system components)
   */
  static async deleteComponent(componentId, userId = null) {
    // Prevent deletion of system components
    const component = await this.getComponentById(componentId);
    if (!component) {
      throw new Error('Component not found');
    }

    if (component.isSystem || component.is_system) {
      throw new Error('Cannot delete system components');
    }

    // Optionally: Check if user created this component
    if (userId && component.created_by !== userId) {
      throw new Error('You can only delete your own components');
    }

    const result = await pool.query(
      'DELETE FROM component_registry WHERE id = $1 RETURNING *',
      [componentId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      componentType: row.component_type,
      baseComponentType: row.base_component_type,
      category: row.category,
      description: row.description,
      isSystem: row.is_system,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : row.config,
    };
  }

  /**
   * Get system components (official SmartStore components)
   */
  static async getSystemComponents() {
    return await this.getAllComponents({ isSystem: true, type: 'system' });
  }

  /**
   * Get user-created components (custom + composite)
   */
  static async getUserComponents(userId = null) {
    const filters = { isSystem: false };
    if (userId) {
      // In the future, we might want to filter by user
      // For now, return all user-created components
    }
    return await this.getAllComponents(filters);
  }
}

module.exports = ComponentModel;

