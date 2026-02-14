const ComponentModel = require('../models/component.model');
const { NotFoundError, ForbiddenError, ValidationError } = require('../../../shared/errors');
const { hasRole } = require('../../../shared/middleware/rbac.middleware');

/**
 * Component Service
 * 
 * Manages component definitions in the global component registry.
 * Component implementations (React code) live in smartstore-app.
 */
class ComponentService {
  /**
   * Get all components (global component registry)
   */
  static async getAllComponents(filters = {}) {
    try {
      const components = await ComponentModel.getAllComponents(filters);
      return components;
    } catch (error) {
      throw new Error(`Failed to fetch components: ${error.message}`);
    }
  }

  /**
   * Get component by ID
   */
  static async getComponentById(componentId) {
    try {
      const component = await ComponentModel.getComponentById(componentId);
      if (!component) {
        throw new NotFoundError(`Component with ID ${componentId} not found`);
      }
      return component;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new Error(`Failed to fetch component: ${error.message}`);
    }
  }

  /**
   * Get component by component type (e.g., 'hero', 'text')
   * For system components, component_type is unique
   */
  static async getComponentByType(componentType) {
    try {
      const component = await ComponentModel.getComponentByType(componentType);
      if (!component) {
        throw new NotFoundError(`Component with type "${componentType}" not found`);
      }
      return component;
    } catch (error) {
      if (error instanceof NotFoundError) {
        throw error;
      }
      throw new Error(`Failed to fetch component by type: ${error.message}`);
    }
  }

  /**
   * Create component
   */
  static async createComponent(componentData, userId) {
    try {
      // Validate required fields
      if (!componentData.name || !componentData.type || !componentData.componentType) {
        throw new ValidationError('Name, type, and componentType are required');
      }

      // Validate type
      if (!['system', 'custom', 'composite'].includes(componentData.type)) {
        throw new ValidationError('Type must be "system", "custom", or "composite"');
      }

      // Custom components must have baseComponentType (reference to system component)
      if (componentData.type === 'custom' && !componentData.baseComponentType) {
        throw new ValidationError('Custom components must specify baseComponentType (the system component they are based on)');
      }

      // System components can only be created by admins or system (no userId)
      if (componentData.type === 'system' && userId) {
        const isAdmin = await hasRole(userId, 'admin');
        if (!isAdmin) {
          throw new ForbiddenError('System components can only be created by administrators');
        }
      }

      // Validate category if provided
      if (componentData.category && !['layout', 'content', 'marketing', 'ecommerce'].includes(componentData.category)) {
        throw new ValidationError('Invalid category');
      }

      // System components: if type is 'system' and user is admin, allow isSystem=true
      // Otherwise, only allow isSystem=true if userId is null (system-level creation)
      let isSystem = false;
      if (componentData.type === 'system' && componentData.isSystem === true) {
        if (userId === null) {
          isSystem = true; // System-level creation
        } else {
          const isAdmin = await hasRole(userId, 'admin');
          if (isAdmin) {
            isSystem = true; // Admin can create system components
          }
        }
      }
      const component = await ComponentModel.createComponent(
        {
          ...componentData,
          isSystem: isSystem || false,
        },
        userId
      );

      return component;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to create component: ${error.message}`);
    }
  }

  /**
   * Update component
   */
  static async updateComponent(componentId, componentData, userId) {
    try {
      const component = await ComponentModel.getComponentById(componentId);
      if (!component) {
        throw new NotFoundError(`Component with ID ${componentId} not found`);
      }

      // Prevent updates to system components unless user is admin
      if (component.is_system && userId) {
        const isAdmin = await hasRole(userId, 'admin');
        if (!isAdmin) {
          throw new ForbiddenError('Cannot update system components. Admin access required.');
        }
      }

      // Prevent changing is_system flag, but allow admins to set it to true for system components
      if (componentData.isSystem !== undefined && componentData.isSystem !== component.is_system) {
        // Allow admin to set isSystem=true when updating a system component (type='system')
        // This handles cases where the component was created with isSystem=false but should be true
        if (componentData.isSystem === true && componentData.type === 'system' && userId) {
          const isAdmin = await hasRole(userId, 'admin');
          if (isAdmin) {
            // Admin can set isSystem=true for system components - this is allowed
            // Continue with the update
          } else {
            throw new ForbiddenError('Cannot change is_system flag. Admin access required.');
          }
        } else {
          // Any other change to is_system flag is not allowed
          throw new ForbiddenError('Cannot change is_system flag');
        }
      }

      // Validate type if provided
      if (componentData.type && !['system', 'custom', 'composite'].includes(componentData.type)) {
        throw new ValidationError('Type must be "system", "custom", or "composite"');
      }

      // Custom components must have baseComponentType (check existing or new)
      const existingBaseType = component.baseComponentType || component.base_component_type
      if (componentData.type === 'custom' && !existingBaseType && !componentData.baseComponentType) {
        throw new ValidationError('Custom components must specify baseComponentType (the system component they are based on)');
      }
      
      // If type is being changed to custom, ensure baseComponentType is provided
      if (componentData.type === 'custom' && component.type !== 'custom' && !componentData.baseComponentType) {
        throw new ValidationError('When changing to custom type, baseComponentType must be provided');
      }

      // Validate category if provided
      if (componentData.category && !['layout', 'content', 'marketing', 'ecommerce'].includes(componentData.category)) {
        throw new ValidationError('Invalid category');
      }

      const updated = await ComponentModel.updateComponent(componentId, componentData, userId);
      return updated;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError || error instanceof ValidationError) {
        throw error;
      }
      throw new Error(`Failed to update component: ${error.message}`);
    }
  }

  /**
   * Delete component (only user-created, not system components)
   */
  static async deleteComponent(componentId, userId) {
    try {
      const component = await ComponentModel.deleteComponent(componentId, userId);
      return component;
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundError(error.message);
      }
      if (error.message.includes('Cannot delete') || error.message.includes('only delete')) {
        throw new ForbiddenError(error.message);
      }
      throw new Error(`Failed to delete component: ${error.message}`);
    }
  }

  /**
   * Get system components (official SmartStore components with React implementations)
   */
  static async getSystemComponents() {
    try {
      return await ComponentModel.getAllComponents({ isSystem: true, type: 'system' });
    } catch (error) {
      throw new Error(`Failed to fetch system components: ${error.message}`);
    }
  }

  /**
   * Get custom components (user-created components based on system components)
   */
  static async getCustomComponents(userId = null) {
    try {
      const filters = { isSystem: false, type: 'custom' };
      return await ComponentModel.getAllComponents(filters);
    } catch (error) {
      throw new Error(`Failed to fetch custom components: ${error.message}`);
    }
  }

  /**
   * Get composite components (user-created components that group multiple components)
   */
  static async getCompositeComponents(userId = null) {
    try {
      const filters = { isSystem: false, type: 'composite' };
      return await ComponentModel.getAllComponents(filters);
    } catch (error) {
      throw new Error(`Failed to fetch composite components: ${error.message}`);
    }
  }

  /**
   * Get user-created components (custom + composite)
   */
  static async getUserComponents(userId = null) {
    try {
      return await ComponentModel.getUserComponents(userId);
    } catch (error) {
      throw new Error(`Failed to fetch user components: ${error.message}`);
    }
  }
}

module.exports = ComponentService;

