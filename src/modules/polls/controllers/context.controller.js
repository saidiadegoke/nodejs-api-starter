/**
 * Context Controller
 *
 * HTTP request handler for poll context/evidence operations
 * Handles context source creation, linking, and engagement tracking
 */

const ContextService = require('../services/context.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

class ContextController {
  /**
   * Create a new context source
   *
   * @route POST /api/polls/contexts
   * @access Private
   */
  static async createContextSource(req, res) {
    try {
      const userId = req.user.user_id;
      const sourceData = req.body;

      const result = await ContextService.createContextSource(userId, sourceData);

      sendSuccess(res, result, 'Context source created successfully', CREATED);
    } catch (error) {
      console.error('Create context source error:', error);
      if (error.message.includes('required') || error.message.includes('must be') || error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get context source by ID
   *
   * @route GET /api/polls/contexts/:source_id
   * @access Public
   */
  static async getContextSource(req, res) {
    try {
      const { source_id } = req.params;

      const source = await ContextService.getContextSourceById(source_id);

      sendSuccess(res, source, 'Context source retrieved successfully', OK);
    } catch (error) {
      console.error('Get context source error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update context source
   *
   * @route PUT /api/polls/contexts/:source_id
   * @access Private
   */
  static async updateContextSource(req, res) {
    try {
      const { source_id } = req.params;
      const userId = req.user.user_id;
      const updates = req.body;

      const result = await ContextService.updateContextSource(source_id, userId, updates);

      sendSuccess(res, result, 'Context source updated successfully', OK);
    } catch (error) {
      console.error('Update context source error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete context source
   *
   * @route DELETE /api/polls/contexts/:source_id
   * @access Private
   */
  static async deleteContextSource(req, res) {
    try {
      const { source_id } = req.params;
      const userId = req.user.user_id;

      await ContextService.deleteContextSource(source_id, userId);

      sendSuccess(res, null, 'Context source deleted successfully', OK);
    } catch (error) {
      console.error('Delete context source error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Search context sources
   *
   * @route GET /api/polls/contexts
   * @access Public
   */
  static async searchContextSources(req, res) {
    try {
      const { query, source_type, tags, page, limit } = req.query;

      const filters = {
        source_type,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined
      };

      const pagination = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await ContextService.searchContextSources(query, filters, pagination);

      sendSuccess(res, result, 'Context sources retrieved successfully', OK);
    } catch (error) {
      console.error('Search context sources error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Link context source to poll
   *
   * @route POST /api/polls/:poll_id/contexts
   * @access Private
   */
  static async linkContextToPoll(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;
      const linkData = req.body;

      const result = await ContextService.linkContextToPoll(poll_id, userId, linkData);

      sendSuccess(res, result, 'Context linked to poll successfully', CREATED);
    } catch (error) {
      console.error('Link context to poll error:', error);
      if (error.message === 'Poll not found' || error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get contexts for a poll
   *
   * @route GET /api/polls/:poll_id/contexts
   * @access Public
   */
  static async getPollContexts(req, res) {
    try {
      const { poll_id } = req.params;
      const { include_blocks } = req.query;

      const contexts = await ContextService.getPollContexts(
        poll_id,
        include_blocks !== 'false'
      );

      sendSuccess(res, contexts, 'Poll contexts retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll contexts error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get required contexts for a poll
   *
   * @route GET /api/polls/:poll_id/contexts/required
   * @access Public
   */
  static async getRequiredPollContexts(req, res) {
    try {
      const { poll_id } = req.params;

      const contexts = await ContextService.getRequiredPollContexts(poll_id);

      sendSuccess(res, contexts, 'Required contexts retrieved successfully', OK);
    } catch (error) {
      console.error('Get required contexts error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Remove context from poll
   *
   * @route DELETE /api/polls/:poll_id/contexts/:source_id
   * @access Private
   */
  static async unlinkContextFromPoll(req, res) {
    try {
      const { poll_id, source_id } = req.params;
      const userId = req.user.user_id;

      await ContextService.unlinkContextFromPoll(poll_id, source_id, userId);

      sendSuccess(res, null, 'Context unlinked from poll successfully', OK);
    } catch (error) {
      console.error('Unlink context from poll error:', error);
      if (error.message === 'Poll not found' || error.message === 'Context link not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Record context engagement
   *
   * @route POST /api/polls/contexts/:source_id/engage
   * @access Public (optionalAuth)
   */
  static async recordEngagement(req, res) {
    try {
      const { source_id } = req.params;
      const userId = req.user?.user_id || null;
      const engagementData = {
        ...req.body,
        source_id,
        user_id: userId
      };

      const result = await ContextService.recordEngagement(engagementData);

      sendSuccess(res, result, 'Engagement recorded successfully', CREATED);
    } catch (error) {
      console.error('Record engagement error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get engagement summary for a source
   *
   * @route GET /api/polls/contexts/:source_id/engagements
   * @access Public
   */
  static async getSourceEngagementSummary(req, res) {
    try {
      const { source_id } = req.params;

      const summary = await ContextService.getSourceEngagementSummary(source_id);

      sendSuccess(res, summary, 'Engagement summary retrieved successfully', OK);
    } catch (error) {
      console.error('Get engagement summary error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get engagement summary for poll's contexts
   *
   * @route GET /api/polls/:poll_id/contexts/engagements
   * @access Public
   */
  static async getPollContextEngagementSummary(req, res) {
    try {
      const { poll_id } = req.params;

      const summary = await ContextService.getPollContextEngagementSummary(poll_id);

      sendSuccess(res, summary, 'Poll context engagement summary retrieved successfully', OK);
    } catch (error) {
      console.error('Get poll engagement summary error:', error);
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Check required contexts completion
   *
   * @route GET /api/polls/:poll_id/contexts/completion
   * @access Private
   */
  static async checkRequiredContextsCompletion(req, res) {
    try {
      const { poll_id } = req.params;
      const userId = req.user.user_id;

      const status = await ContextService.checkRequiredContextsCompletion(userId, poll_id);

      sendSuccess(res, status, 'Context completion status retrieved successfully', OK);
    } catch (error) {
      console.error('Check context completion error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Add blocks to context source
   *
   * @route POST /api/polls/contexts/:source_id/blocks
   * @access Private
   */
  static async addBlocksToSource(req, res) {
    try {
      const { source_id } = req.params;
      const userId = req.user.user_id;
      const { blocks } = req.body;

      if (!blocks || !Array.isArray(blocks)) {
        return sendError(res, 'Blocks array is required', 422);
      }

      const result = await ContextService.addBlocksToSource(source_id, userId, blocks);

      sendSuccess(res, result, 'Blocks added successfully', CREATED);
    } catch (error) {
      console.error('Add blocks error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message.includes('Invalid')) {
        return sendError(res, error.message, 422);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update context block
   *
   * @route PUT /api/polls/contexts/blocks/:block_id
   * @access Private
   */
  static async updateContextBlock(req, res) {
    try {
      const { block_id } = req.params;
      const userId = req.user.user_id;
      const updates = req.body;

      const result = await ContextService.updateContextBlock(block_id, userId, updates);

      sendSuccess(res, result, 'Block updated successfully', OK);
    } catch (error) {
      console.error('Update block error:', error);
      if (error.message === 'Context block not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete context block
   *
   * @route DELETE /api/polls/contexts/blocks/:block_id
   * @access Private
   */
  static async deleteContextBlock(req, res) {
    try {
      const { block_id } = req.params;
      const userId = req.user.user_id;

      await ContextService.deleteContextBlock(block_id, userId);

      sendSuccess(res, null, 'Block deleted successfully', OK);
    } catch (error) {
      console.error('Delete block error:', error);
      if (error.message === 'Context block not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message.includes('not authorized')) {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = ContextController;
