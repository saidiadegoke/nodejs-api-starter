const ComponentService = require('../services/component.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

/**
 * Component Controller
 * 
 * HTTP request handlers for component management.
 * Components are stored globally in the component registry.
 * Component implementations (React code) live in smartstore-app.
 */
class ComponentController {
  /**
   * @route   GET /api/components
   * @desc    Get all components (global component registry)
   * @access  Public (or Private for authenticated users)
   */
  static async getAllComponents(req, res) {
    try {
      const filters = {
        isSystem: req.query.isSystem !== undefined ? req.query.isSystem === 'true' : undefined,
        type: req.query.type,
        category: req.query.category,
        search: req.query.search,
        componentTypePrefix: req.query.componentTypePrefix, // e.g., 'hero-template-' to get all hero templates
      };

      const components = await ComponentService.getAllComponents(filters);

      sendSuccess(res, components, 'Components fetched successfully', OK);
    } catch (error) {
      console.error('Get all components error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/by-type/:componentType
   * @desc    Get component by component type (e.g., 'hero', 'text')
   * @access  Public (or Private for authenticated users)
   */
  static async getComponentByType(req, res) {
    try {
      const { componentType } = req.params;
      const component = await ComponentService.getComponentByType(componentType);

      sendSuccess(res, component, 'Component fetched successfully', OK);
    } catch (error) {
      console.error('Get component by type error:', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/:id
   * @desc    Get component by ID or component type
   * @access  Public (or Private for authenticated users)
   * 
   * If id is a number, treat as ID. If it's a string, try to find by component type.
   */
  static async getComponentById(req, res) {
    try {
      const { id } = req.params;
      
      // Check if id is a number (component ID) or string (component type)
      const isNumericId = /^\d+$/.test(id);
      
      let component;
      if (isNumericId) {
        // Treat as numeric ID
        component = await ComponentService.getComponentById(id);
      } else {
        // Treat as component type (e.g., 'hero', 'text')
        component = await ComponentService.getComponentByType(id);
      }

      sendSuccess(res, component, 'Component fetched successfully', OK);
    } catch (error) {
      console.error('Get component by ID/type error:', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   POST /api/components
   * @desc    Create new component
   * @access  Private (authenticated users)
   */
  static async createComponent(req, res) {
    try {
      const userId = req.user?.user_id || null;
      const componentData = req.body;

      const component = await ComponentService.createComponent(componentData, userId);

      sendSuccess(res, component, 'Component created successfully', CREATED);
    } catch (error) {
      console.error('Create component error:', error);
      if (error.statusCode === 400) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   PUT /api/components/:id
   * @desc    Update component
   * @access  Private (authenticated users, only their own components)
   */
  static async updateComponent(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.user_id || null;
      const componentData = req.body;

      const component = await ComponentService.updateComponent(id, componentData, userId);

      sendSuccess(res, component, 'Component updated successfully', OK);
    } catch (error) {
      console.error('Update component error:', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.statusCode === 400) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   DELETE /api/components/:id
   * @desc    Delete component (only user-created, not system components)
   * @access  Private (authenticated users, only their own components)
   */
  static async deleteComponent(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user?.user_id || null;

      const component = await ComponentService.deleteComponent(id, userId);

      sendSuccess(res, component, 'Component deleted successfully', OK);
    } catch (error) {
      console.error('Delete component error:', error);
      if (error.statusCode === 404) {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.statusCode === 403) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/system
   * @desc    Get system components (official SmartStore components)
   * @access  Public
   */
  static async getSystemComponents(req, res) {
    try {
      const components = await ComponentService.getSystemComponents();

      sendSuccess(res, components, 'System components fetched successfully', OK);
    } catch (error) {
      console.error('Get system components error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/user
   * @desc    Get user-created components (custom + composite)
   * @access  Private (authenticated users)
   */
  static async getUserComponents(req, res) {
    try {
      const userId = req.user?.user_id || null;
      const components = await ComponentService.getUserComponents(userId);

      sendSuccess(res, components, 'User components fetched successfully', OK);
    } catch (error) {
      console.error('Get user components error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/custom
   * @desc    Get custom components (user-created components based on system components)
   * @access  Private (authenticated users)
   */
  static async getCustomComponents(req, res) {
    try {
      const userId = req.user?.user_id || null;
      const components = await ComponentService.getCustomComponents(userId);

      sendSuccess(res, components, 'Custom components fetched successfully', OK);
    } catch (error) {
      console.error('Get custom components error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * @route   GET /api/components/composite
   * @desc    Get composite components (user-created components that group multiple components)
   * @access  Private (authenticated users)
   */
  static async getCompositeComponents(req, res) {
    try {
      const userId = req.user?.user_id || null;
      const components = await ComponentService.getCompositeComponents(userId);

      sendSuccess(res, components, 'Composite components fetched successfully', OK);
    } catch (error) {
      console.error('Get composite components error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = ComponentController;

