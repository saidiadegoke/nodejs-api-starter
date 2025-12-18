const { sendSuccess, sendError } = require('../../../shared/utils/response');
const authoringService = require('../services/authoring.service');
const multer = require('multer');
const path = require('path');

/**
 * Create multiple polls in bulk
 * @route POST /authoring/bulk-polls
 * @access Requires 'authoring.bulk_create' permission
 */
const createBulkPolls = async (req, res) => {
  try {
    const { polls } = req.body;
    const userId = req.user.user_id;

    if (!polls || !Array.isArray(polls) || polls.length === 0) {
      return sendError(res, 'Polls array is required and must not be empty', 400);
    }

    if (polls.length > 50) {
      return sendError(res, 'Maximum 50 polls can be created at once', 400);
    }

    const result = await authoringService.createBulkPolls(polls, userId);
    sendSuccess(res, result, 'Bulk polls created successfully');
  } catch (error) {
    console.error('Error creating bulk polls:', error);
    sendError(res, error.message || 'Failed to create bulk polls', 500);
  }
};

/**
 * Create multiple stories in bulk
 * @route POST /authoring/bulk-stories
 * @access Requires 'authoring.bulk_create' permission
 */
const createBulkStories = async (req, res) => {
  try {
    const { stories } = req.body;
    const userId = req.user.user_id;

    if (!stories || !Array.isArray(stories) || stories.length === 0) {
      return sendError(res, 'Stories array is required and must not be empty', 400);
    }

    if (stories.length > 20) {
      return sendError(res, 'Maximum 20 stories can be created at once', 400);
    }

    const result = await authoringService.createBulkStories(stories, userId);
    sendSuccess(res, result, 'Bulk stories created successfully');
  } catch (error) {
    console.error('Error creating bulk stories:', error);
    sendError(res, error.message || 'Failed to create bulk stories', 500);
  }
};

/**
 * Get bulk creation templates
 * @route GET /authoring/templates
 * @access Requires 'authoring.bulk_create' permission
 */
const getTemplates = async (req, res) => {
  try {
    const templates = await authoringService.getTemplates();
    sendSuccess(res, templates, 'Templates retrieved successfully');
  } catch (error) {
    console.error('Error getting templates:', error);
    sendError(res, 'Failed to retrieve templates', 500);
  }
};

/**
 * Bulk create polls and stories from uploaded file (follows polls.seeder.js format)
 * @route POST /authoring/bulk-create
 * @access Requires 'authoring.bulk_create' permission
 */
const bulkCreateFromFile = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file uploaded', 400);
    }

    const userId = req.user.user_id;
    const result = await authoringService.processBulkCreationFile(req.file, userId);
    
    sendSuccess(res, {
      success: true,
      created_polls: result.created_polls,
      created_stories: result.created_stories,
      errors: result.errors,
      details: result.details
    }, 'Bulk creation completed');
  } catch (error) {
    console.error('Error processing bulk creation file:', error);
    sendError(res, error.message || 'Failed to process bulk creation file', 500);
  }
};

/**
 * Download template file for bulk creation
 * @route GET /authoring/template/:format
 * @access Requires 'authoring.bulk_create' permission
 */
const downloadTemplate = async (req, res) => {
  try {
    const { format } = req.params;
    
    if (!['json', 'csv'].includes(format)) {
      return sendError(res, 'Format must be either "json" or "csv"', 400);
    }

    const templateData = await authoringService.generateTemplate(format);
    
    res.setHeader('Content-Type', format === 'json' ? 'application/json' : 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="bulk-creation-template.${format}"`);
    res.send(templateData);
  } catch (error) {
    console.error('Error generating template:', error);
    sendError(res, error.message || 'Failed to generate template', 500);
  }
};

/**
 * Create single content using wizard
 * @route POST /authoring/wizard
 * @access Requires 'authoring.create' permission (different from bulk_create)
 */
const createWithWizard = async (req, res) => {
  try {
    const { wizardType, wizardData } = req.body;
    const userId = req.user.user_id;

    if (!wizardType || !wizardData) {
      return sendError(res, 'Wizard type and data are required', 400);
    }

    const validWizardTypes = ['poll_wizard', 'story_wizard', 'quick_poll_wizard', 'advanced_poll_wizard'];
    if (!validWizardTypes.includes(wizardType)) {
      return sendError(res, `Invalid wizard type. Must be one of: ${validWizardTypes.join(', ')}`, 400);
    }

    const result = await authoringService.createWithWizard(wizardType, wizardData, userId);
    sendSuccess(res, result, 'Content created with wizard successfully');
  } catch (error) {
    console.error('Error creating with wizard:', error);
    sendError(res, error.message || 'Failed to create content with wizard', 500);
  }
};

/**
 * Get wizard templates and configurations
 * @route GET /authoring/wizards
 * @access Requires 'authoring.bulk_create' permission
 */
const getWizards = async (req, res) => {
  try {
    const wizards = await authoringService.getWizardConfigurations();
    sendSuccess(res, wizards, 'Wizard configurations retrieved successfully');
  } catch (error) {
    console.error('Error getting wizard configurations:', error);
    sendError(res, 'Failed to retrieve wizard configurations', 500);
  }
};

/**
 * Get authoring history
 * @route GET /authoring/history
 * @access Requires 'authoring.bulk_create' permission
 */
const getAuthoringHistory = async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { page = 1, limit = 20 } = req.query;
    
    const history = await authoringService.getAuthoringHistory(userId, parseInt(page), parseInt(limit));
    sendSuccess(res, history, 'Authoring history retrieved successfully');
  } catch (error) {
    console.error('Error getting authoring history:', error);
    sendError(res, 'Failed to retrieve authoring history', 500);
  }
};

module.exports = {
  createBulkPolls,
  createBulkStories,
  bulkCreateFromFile,
  downloadTemplate,
  createWithWizard,
  getWizards,
  getTemplates,
  getAuthoringHistory,
};