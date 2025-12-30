/**
 * Poll Collection Controller
 *
 * HTTP request handler for poll collection operations
 * Handles collection creation, retrieval, updates, and wizard functionality
 */

const PollCollectionService = require('../services/poll-collection.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, CREATED, BAD_REQUEST, NOT_FOUND, FORBIDDEN } = require('../../../shared/constants/statusCodes');

class PollCollectionController {
  /**
   * Create a new poll collection
   *
   * @route POST /api/collections
   * @access Private
   */
  static async createCollection(req, res) {
    try {
      const userId = req.user.user_id;
      const collectionData = req.body;

      const collection = await PollCollectionService.createCollection(userId, collectionData);

      sendSuccess(res, collection, 'Collection created successfully', CREATED);
    } catch (error) {
      console.error('Create collection error:', error);
      if (error.message.includes('must be') || error.message.includes('not found') || error.message.includes('not accessible')) {
        return sendError(res, error.message, BAD_REQUEST);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get collection by slug
   *
   * @route GET /api/collections/:slug
   * @access Public (optionalAuth for user-specific data)
   */
  static async getCollectionBySlug(req, res) {
    try {
      const { slug } = req.params;
      const userId = req.user?.user_id || null;

      const collection = await PollCollectionService.getCollectionBySlug(slug, userId);

      sendSuccess(res, collection, 'Collection retrieved successfully', OK);
    } catch (error) {
      console.error('Get collection error:', error);
      if (error.message === 'Collection not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'Collection is private') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get collection summary (after completion)
   *
   * @route GET /api/collections/:slug/summary
   * @access Private
   */
  static async getCollectionSummary(req, res) {
    try {
      const { slug } = req.params;
      const userId = req.user.user_id;

      const summary = await PollCollectionService.getCollectionSummary(slug, userId);

      sendSuccess(res, summary, 'Collection summary retrieved successfully', OK);
    } catch (error) {
      console.error('Get collection summary error:', error);
      if (error.message === 'Collection not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Get user's collections
   *
   * @route GET /api/collections/my-collections
   * @access Private
   */
  static async getMyCollections(req, res) {
    try {
      const userId = req.user.user_id;
      const { page, limit } = req.query;

      const options = {
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 20
      };

      const result = await PollCollectionService.getUserCollections(userId, options);

      sendSuccess(res, result, 'Your collections retrieved successfully', OK);
    } catch (error) {
      console.error('Get user collections error:', error);
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Update collection
   *
   * @route PUT /api/collections/:collection_id
   * @access Private (owner only)
   */
  static async updateCollection(req, res) {
    try {
      const { collection_id } = req.params;
      const userId = req.user.user_id;
      const updates = req.body;

      const collection = await PollCollectionService.updateCollection(collection_id, userId, updates);

      sendSuccess(res, collection, 'Collection updated successfully', OK);
    } catch (error) {
      console.error('Update collection error:', error);
      if (error.message === 'Not authorized to update this collection') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Delete collection
   *
   * @route DELETE /api/collections/:collection_id
   * @access Private (owner only)
   */
  static async deleteCollection(req, res) {
    try {
      const { collection_id } = req.params;
      const userId = req.user.user_id;

      await PollCollectionService.deleteCollection(collection_id, userId);

      sendSuccess(res, null, 'Collection deleted successfully', OK);
    } catch (error) {
      console.error('Delete collection error:', error);
      if (error.message === 'Not authorized to delete this collection') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Add poll to collection
   *
   * @route POST /api/collections/:collection_id/polls
   * @access Private (owner only)
   */
  static async addPollToCollection(req, res) {
    try {
      const { collection_id } = req.params;
      const userId = req.user.user_id;
      const { poll_id, order_index } = req.body;

      if (!poll_id) {
        return sendError(res, 'poll_id is required', BAD_REQUEST);
      }

      const collection = await PollCollectionService.addPollToCollection(
        collection_id,
        userId,
        poll_id,
        order_index
      );

      sendSuccess(res, collection, 'Poll added to collection successfully', OK);
    } catch (error) {
      console.error('Add poll to collection error:', error);
      if (error.message === 'Not authorized to modify this collection') {
        return sendError(res, error.message, FORBIDDEN);
      }
      if (error.message === 'Poll not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Remove poll from collection
   *
   * @route DELETE /api/collections/:collection_id/polls/:poll_id
   * @access Private (owner only)
   */
  static async removePollFromCollection(req, res) {
    try {
      const { collection_id, poll_id } = req.params;
      const userId = req.user.user_id;

      const collection = await PollCollectionService.removePollFromCollection(
        collection_id,
        userId,
        poll_id
      );

      sendSuccess(res, collection, 'Poll removed from collection successfully', OK);
    } catch (error) {
      console.error('Remove poll from collection error:', error);
      if (error.message === 'Not authorized to modify this collection') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Reorder polls in collection
   *
   * @route PUT /api/collections/:collection_id/reorder
   * @access Private (owner only)
   */
  static async reorderPolls(req, res) {
    try {
      const { collection_id } = req.params;
      const userId = req.user.user_id;
      const { poll_ids } = req.body;

      if (!Array.isArray(poll_ids) || poll_ids.length === 0) {
        return sendError(res, 'poll_ids array is required', BAD_REQUEST);
      }

      const collection = await PollCollectionService.reorderPolls(
        collection_id,
        userId,
        poll_ids
      );

      sendSuccess(res, collection, 'Polls reordered successfully', OK);
    } catch (error) {
      console.error('Reorder polls error:', error);
      if (error.message === 'Not authorized to modify this collection') {
        return sendError(res, error.message, FORBIDDEN);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }

  /**
   * Generate collection from context-linked polls
   *
   * @route GET /api/context/:context_id/collection
   * @access Public (optionalAuth for user-specific data)
   */
  static async generateCollectionFromContext(req, res) {
    try {
      const { context_id } = req.params;
      const userId = req.user?.user_id || null;

      const collection = await PollCollectionService.generateCollectionFromContext(context_id, userId);

      sendSuccess(res, collection, 'Collection generated successfully', OK);
    } catch (error) {
      console.error('Generate collection from context error:', error);
      if (error.message === 'Context source not found') {
        return sendError(res, error.message, NOT_FOUND);
      }
      if (error.message === 'No polls linked to this context') {
        return sendError(res, error.message, NOT_FOUND);
      }
      sendError(res, error.message, BAD_REQUEST);
    }
  }
}

module.exports = PollCollectionController;
