/**
 * Poll Collection Routes
 *
 * API routes for poll collection management
 */

const express = require('express');
const router = express.Router();
const { param, query } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const PollCollectionController = require('./controllers/poll-collection.controller');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { optionalAuth } = require('../../shared/middleware/optional-auth.middleware');
const { requirePermission } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   POST /api/collections
 * @desc    Create a new poll collection
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  // requirePermission('polls.create'),
  PollCollectionController.createCollection
);

/**
 * @route   GET /api/collections/my-collections
 * @desc    Get user's collections
 * @access  Private
 */
router.get(
  '/my-collections',
  authenticate,
  PollCollectionController.getMyCollections
);

/**
 * @route   GET /api/collections/:slug
 * @desc    Get collection by slug (public sharing)
 * @access  Public (optionalAuth for user progress)
 */
router.get(
  '/:slug',
  optionalAuth,
  PollCollectionController.getCollectionBySlug
);

/**
 * @route   GET /api/collections/:slug/summary
 * @desc    Get collection summary after completion
 * @access  Private
 */
router.get(
  '/:slug/summary',
  authenticate,
  PollCollectionController.getCollectionSummary
);

/**
 * @route   PUT /api/collections/:collection_id
 * @desc    Update collection
 * @access  Private (owner only)
 */
router.put(
  '/:collection_id',
  authenticate,
  // requirePermission('polls.update'),
  PollCollectionController.updateCollection
);

/**
 * @route   DELETE /api/collections/:collection_id
 * @desc    Delete collection
 * @access  Private (owner only)
 */
router.delete(
  '/:collection_id',
  authenticate,
  // requirePermission('polls.delete'),
  PollCollectionController.deleteCollection
);

/**
 * @route   POST /api/collections/:collection_id/polls
 * @desc    Add poll to collection
 * @access  Private (owner only)
 */
router.post(
  '/:collection_id/polls',
  authenticate,
  // requirePermission('polls.update'),
  PollCollectionController.addPollToCollection
);

/**
 * @route   DELETE /api/collections/:collection_id/polls/:poll_id
 * @desc    Remove poll from collection
 * @access  Private (owner only)
 */
router.delete(
  '/:collection_id/polls/:poll_id',
  authenticate,
  // requirePermission('polls.update'),
  PollCollectionController.removePollFromCollection
);

/**
 * @route   PUT /api/collections/:collection_id/reorder
 * @desc    Reorder polls in collection
 * @access  Private (owner only)
 */
router.put(
  '/:collection_id/reorder',
  authenticate,
  // requirePermission('polls.update'),
  PollCollectionController.reorderPolls
);

/**
 * @route   GET /api/collections/:collection_id/responses/detailed
 * @desc    Get detailed responses for all polls in collection (requires permission)
 * @access  Private - requires collections.view_responses permission
 */
router.get(
  '/:collection_id/responses/detailed',
  authenticate,
  requirePermission('collections.view_responses'),
  [
    param('collection_id').isUUID().withMessage('Invalid collection ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('search').optional().trim(),
    query('format').optional().isIn(['json', 'csv']).withMessage('Format must be json or csv')
  ],
  validate,
  PollCollectionController.getDetailedResponses
);

/**
 * @route   GET /api/context/:context_id/collection
 * @desc    Generate collection from context-linked polls
 * @access  Public (optionalAuth for user progress)
 */
router.get(
  '/../context/:context_id/collection',
  optionalAuth,
  PollCollectionController.generateCollectionFromContext
);

module.exports = router;
