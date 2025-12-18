/**
 * Poll Routes
 *
 * Defines all poll-related endpoints with validation
 */

const express = require('express');
const { body, param, query } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { authenticate } = require('../../shared/middleware/authenticate.middleware');
const { optionalAuth } = require('../../shared/middleware/optional-auth.middleware');
const PollController = require('./controllers/poll.controller');
const PollResponseController = require('./controllers/poll-response.controller');
const PollEngagementController = require('./controllers/poll-engagement.controller');
const PollCommentController = require('./controllers/poll-comment.controller');
const PollRatingController = require('./controllers/poll-rating.controller');
const ContextController = require('./controllers/context.controller');

const router = express.Router();

// ==================== Poll Routes ====================

/**
 * @route   POST /api/polls
 * @desc    Create a new poll
 * @access  Private
 */
router.post(
  '/',
  authenticate,
  [
    body('question')
      .trim()
      .notEmpty().withMessage('Poll question is required')
      .isLength({ min: 10 }).withMessage('Question must be at least 10 characters'),
    body('poll_type')
      .notEmpty().withMessage('Poll type is required')
      .isIn([
        'yesno', 'multipleChoice', 'multiSelect', 'ranking', 'likertScale',
        'slider', 'imageBased', 'abcTest', 'openEnded', 'predictionMarket',
        'agreementDistribution', 'mapBased', 'timeline', 'binaryWithExplanation', 'gamified'
      ]).withMessage('Invalid poll type'),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('category').optional().trim(),
    body('config').optional().isObject().withMessage('Config must be an object'),
    body('cover_image').optional().isURL().withMessage('Cover image must be a valid URL'),
    body('duration').optional().matches(/^(\d+[hdwm]|never)$/).withMessage('Invalid duration format'),
    body('options').optional().isArray().withMessage('Options must be an array')
  ],
  validate,
  PollController.createPoll
);

/**
 * @route   GET /api/polls
 * @desc    Get polls feed
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().trim(),
    query('poll_type').optional().trim(),
    query('status').optional().isIn(['active', 'closed', 'draft']).withMessage('Invalid status')
  ],
  validate,
  PollController.getPollsFeed
);

/**
 * @route   GET /api/polls/feed
 * @desc    Get polls feed (alias for backward compatibility)
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/feed',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('category').optional().trim(),
    query('poll_type').optional().trim(),
    query('status').optional().isIn(['active', 'closed', 'draft']).withMessage('Invalid status')
  ],
  validate,
  PollController.getPollsFeed
);

/**
 * @route   GET /api/polls/search
 * @desc    Search polls with comprehensive criteria
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/search',
  optionalAuth,
  [
    query('q').optional().trim(),
    query('category').optional().trim(),
    query('poll_type').optional().trim(),
    query('author').optional().trim(),
    query('status').optional().isIn(['active', 'closed', 'draft']).withMessage('Invalid status'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollController.searchPolls
);

/**
 * @route   GET /api/polls/trending
 * @desc    Get trending polls
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/trending',
  optionalAuth,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50')
  ],
  validate,
  PollController.getTrendingPolls
);

// ==================== Sidebar Routes ====================

/**
 * @route   GET /api/polls/sidebar/trending-debates
 * @desc    Get trending debates for sidebar
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/sidebar/trending-debates',
  optionalAuth,
  [
    query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('Limit must be between 1 and 10')
  ],
  validate,
  PollController.getTrendingDebates
);

/**
 * @route   GET /api/polls/sidebar/rising
 * @desc    Get rising polls for sidebar
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/sidebar/rising',
  optionalAuth,
  [
    query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('Limit must be between 1 and 10')
  ],
  validate,
  PollController.getRisingPolls
);

/**
 * @route   GET /api/polls/sidebar/recommended
 * @desc    Get recommended polls for sidebar
 * @access  Public (optionalAuth, returns trending if not authenticated)
 */
router.get(
  '/sidebar/recommended',
  optionalAuth,
  [
    query('limit').optional().isInt({ min: 1, max: 10 }).withMessage('Limit must be between 1 and 10')
  ],
  validate,
  PollController.getRecommendedPolls
);

/**
 * @route   GET /api/polls/my-polls
 * @desc    Get user's polls
 * @access  Private
 */
router.get(
  '/my-polls',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('status').optional().isIn(['active', 'closed', 'draft']).withMessage('Invalid status')
  ],
  validate,
  PollController.getMyPolls
);

/**
 * @route   GET /api/polls/me/stats
 * @desc    Get user's poll statistics
 * @access  Private
 */
router.get(
  '/me/stats',
  authenticate,
  PollController.getMyPollStats
);

/**
 * @route   GET /api/polls/contexts
 * @desc    Search/list context sources
 * @access  Public
 */
router.get(
  '/contexts',
  [
    query('query').optional().trim(),
    query('source_type').optional().trim().isIn([
      'research', 'news_article', 'blog_post', 'whitepaper', 'dataset', 
      'report', 'story', 'study', 'survey'
    ]).withMessage('Invalid source type'),
    query('tags').optional(),
    query('author').optional().trim(),
    query('publisher').optional().trim(),
    query('credibility_min').optional().isFloat({ min: 0, max: 10 }).withMessage('Credibility min must be between 0 and 10'),
    query('credibility_max').optional().isFloat({ min: 0, max: 10 }).withMessage('Credibility max must be between 0 and 10'),
    query('date_from').optional().isDate().withMessage('Invalid date format for date_from'),
    query('date_to').optional().isDate().withMessage('Invalid date format for date_to'),
    query('sort_by').optional().isIn([
      'created_at', 'updated_at', 'title', 'author', 'publisher', 'publication_date', 'credibility_score'
    ]).withMessage('Invalid sort field'),
    query('sort_order').optional().isIn(['asc', 'desc']).withMessage('Sort order must be asc or desc'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  ContextController.searchContextSources
);

/**
 * @route   GET /api/polls/:poll_id
 * @desc    Get poll by ID
 * @access  Public (optionalAuth for user-specific data)
 */
router.get(
  '/:poll_id',
  optionalAuth,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollController.getPoll
);

/**
 * @route   PUT /api/polls/:poll_id
 * @desc    Update poll
 * @access  Private (owner only)
 */
router.put(
  '/:poll_id',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    body('title').optional().trim(),
    body('description').optional().trim(),
    body('question').optional().trim().isLength({ min: 10 }).withMessage('Question must be at least 10 characters'),
    body('category').optional().trim(),
    body('config').optional().isObject().withMessage('Config must be an object'),
    body('cover_image').optional().isURL().withMessage('Cover image must be a valid URL')
  ],
  validate,
  PollController.updatePoll
);

/**
 * @route   POST /api/polls/:poll_id/close
 * @desc    Close poll
 * @access  Private (owner only)
 */
router.post(
  '/:poll_id/close',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollController.closePoll
);

/**
 * @route   DELETE /api/polls/:poll_id
 * @desc    Delete poll
 * @access  Private (owner only)
 */
router.delete(
  '/:poll_id',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollController.deletePoll
);

/**
 * @route   GET /api/polls/:poll_id/results
 * @desc    Get aggregated poll results (formatted by poll type)
 * @access  Public
 */
router.get(
  '/:poll_id/results',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollResponseController.getPollResults
);

// ==================== Response Routes ====================

/**
 * @route   POST /api/polls/:poll_id/responses
 * @desc    Submit or update poll response
 * @access  Private
 */
router.post(
  '/:poll_id/responses',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    body('option_id').optional().isUUID().withMessage('Invalid option ID'),
    body('option_ids').optional().isArray().withMessage('Option IDs must be an array'),
    body('numeric_value').optional().isNumeric().withMessage('Numeric value must be a number'),
    body('text_value').optional().trim(),
    body('ranking_data').optional().isArray().withMessage('Ranking data must be an array')
  ],
  validate,
  PollResponseController.submitResponse
);

/**
 * @route   GET /api/polls/:poll_id/responses/me
 * @desc    Get user's response to a poll (raw data)
 * @access  Private
 */
router.get(
  '/:poll_id/responses/me',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollResponseController.getMyResponse
);

/**
 * @route   GET /api/polls/:poll_id/my-response
 * @desc    Get formatted user's response to a poll
 * @access  Private
 */
router.get(
  '/:poll_id/my-response',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollResponseController.getFormattedMyResponse
);

/**
 * @route   DELETE /api/polls/:poll_id/responses/me
 * @desc    Delete user's response
 * @access  Private
 */
router.delete(
  '/:poll_id/responses/me',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollResponseController.deleteMyResponse
);

/**
 * @route   GET /api/polls/:poll_id/responses
 * @desc    Get all responses for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/responses',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollResponseController.getPollResponses
);

/**
 * @route   GET /api/polls/responses/me
 * @desc    Get user's response history
 * @access  Private
 */
router.get(
  '/responses/me',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollResponseController.getMyResponseHistory
);

/**
 * @route   GET /api/polls/:poll_id/responses/check
 * @desc    Check if user has responded to poll
 * @access  Private
 */
router.get(
  '/:poll_id/responses/check',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollResponseController.checkUserResponse
);

// ==================== Engagement Routes ====================

/**
 * @route   POST /api/polls/:poll_id/like
 * @desc    Toggle like on poll
 * @access  Private
 */
router.post(
  '/:poll_id/like',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.toggleLike
);

/**
 * @route   POST /api/polls/:poll_id/bookmark
 * @desc    Toggle bookmark on poll
 * @access  Private
 */
router.post(
  '/:poll_id/bookmark',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.toggleBookmark
);

/**
 * @route   POST /api/polls/:poll_id/share
 * @desc    Record poll share
 * @access  Private
 */
router.post(
  '/:poll_id/share',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.recordShare
);

/**
 * @route   POST /api/polls/:poll_id/repost
 * @desc    Record poll repost
 * @access  Private
 */
router.post(
  '/:poll_id/repost',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.recordRepost
);

/**
 * @route   POST /api/polls/:poll_id/view
 * @desc    Record poll view
 * @access  Public (optionalAuth)
 */
router.post(
  '/:poll_id/view',
  optionalAuth,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.recordView
);

/**
 * @route   GET /api/polls/:poll_id/engagements/me
 * @desc    Get user's engagements for a poll
 * @access  Private
 */
router.get(
  '/:poll_id/engagements/me',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.getMyEngagements
);

/**
 * @route   GET /api/polls/bookmarks/me
 * @desc    Get user's bookmarked polls
 * @access  Private
 */
router.get(
  '/bookmarks/me',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollEngagementController.getMyBookmarks
);

/**
 * @route   GET /api/polls/:poll_id/engagements/counts
 * @desc    Get engagement counts for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/engagements/counts',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollEngagementController.getEngagementCounts
);

/**
 * @route   GET /api/polls/:poll_id/likes
 * @desc    Get users who liked a poll
 * @access  Public
 */
router.get(
  '/:poll_id/likes',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollEngagementController.getPollLikes
);

// ==================== Comment Routes ====================

/**
 * @route   POST /api/polls/:poll_id/comments
 * @desc    Create a comment on a poll
 * @access  Private
 */
router.post(
  '/:poll_id/comments',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    body('comment').trim().notEmpty().withMessage('Comment cannot be empty').isLength({ min: 1, max: 1000 }).withMessage('Comment must be between 1 and 1000 characters'),
    body('parent_comment_id').optional().isUUID().withMessage('Invalid parent comment ID')
  ],
  validate,
  PollCommentController.createComment
);

/**
 * @route   GET /api/polls/:poll_id/comments
 * @desc    Get comments for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/comments',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('parent_comment_id').optional().isUUID().withMessage('Invalid parent comment ID')
  ],
  validate,
  PollCommentController.getPollComments
);

/**
 * @route   GET /api/polls/comments/:comment_id
 * @desc    Get a specific comment
 * @access  Public
 */
router.get(
  '/comments/:comment_id',
  [
    param('comment_id').isUUID().withMessage('Invalid comment ID')
  ],
  validate,
  PollCommentController.getComment
);

/**
 * @route   PUT /api/polls/comments/:comment_id
 * @desc    Update a comment
 * @access  Private (owner only)
 */
router.put(
  '/comments/:comment_id',
  authenticate,
  [
    param('comment_id').isUUID().withMessage('Invalid comment ID'),
    body('comment').trim().notEmpty().withMessage('Comment cannot be empty').isLength({ min: 1, max: 1000 }).withMessage('Comment must be between 1 and 1000 characters')
  ],
  validate,
  PollCommentController.updateComment
);

/**
 * @route   DELETE /api/polls/comments/:comment_id
 * @desc    Delete a comment
 * @access  Private (owner only)
 */
router.delete(
  '/comments/:comment_id',
  authenticate,
  [
    param('comment_id').isUUID().withMessage('Invalid comment ID')
  ],
  validate,
  PollCommentController.deleteComment
);

/**
 * @route   GET /api/polls/comments/:comment_id/replies
 * @desc    Get replies to a comment
 * @access  Public
 */
router.get(
  '/comments/:comment_id/replies',
  [
    param('comment_id').isUUID().withMessage('Invalid comment ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollCommentController.getCommentReplies
);

/**
 * @route   GET /api/polls/comments/me
 * @desc    Get user's comment history
 * @access  Private
 */
router.get(
  '/comments/me',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollCommentController.getMyComments
);

// ==================== Rating Routes ====================

/**
 * @route   POST /api/polls/:poll_id/ratings
 * @desc    Submit or update a rating for a poll
 * @access  Private
 */
router.post(
  '/:poll_id/ratings',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be between 1 and 5')
  ],
  validate,
  PollRatingController.submitRating
);

/**
 * @route   GET /api/polls/:poll_id/ratings/stats
 * @desc    Get rating statistics for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/ratings/stats',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollRatingController.getRatingStats
);

/**
 * @route   GET /api/polls/:poll_id/ratings/me
 * @desc    Get user's rating for a poll
 * @access  Private
 */
router.get(
  '/:poll_id/ratings/me',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollRatingController.getMyRating
);

/**
 * @route   DELETE /api/polls/:poll_id/ratings/me
 * @desc    Delete user's rating
 * @access  Private
 */
router.delete(
  '/:poll_id/ratings/me',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  PollRatingController.deleteRating
);

/**
 * @route   GET /api/polls/ratings/me
 * @desc    Get user's rating history
 * @access  Private
 */
router.get(
  '/ratings/me',
  authenticate,
  [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100')
  ],
  validate,
  PollRatingController.getMyRatings
);

// ==================== Context Routes ====================

/**
 * @route   POST /api/polls/contexts
 * @desc    Create a new context source
 * @access  Private
 */
router.post(
  '/contexts',
  authenticate,
  [
    body('source_type')
      .notEmpty().withMessage('Source type is required')
      .isIn(['research', 'news_article', 'blog_post', 'whitepaper', 'dataset', 'report', 'story', 'study', 'survey'])
      .withMessage('Invalid source type'),
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
    body('summary').optional().trim(),
    body('author').optional().trim(),
    body('publisher').optional().trim(),
    body('source_url').optional().isURL().withMessage('Source URL must be valid'),
    body('publication_date').optional().isDate().withMessage('Invalid publication date'),
    body('credibility_score').optional().isFloat({ min: 0, max: 10 }).withMessage('Credibility score must be between 0 and 10'),
    body('tags').optional().isArray().withMessage('Tags must be an array'),
    body('blocks').optional().isArray().withMessage('Blocks must be an array')
  ],
  validate,
  ContextController.createContextSource
);



/**
 * @route   GET /api/polls/contexts/:source_id
 * @desc    Get context source by ID
 * @access  Public
 */
router.get(
  '/contexts/:source_id',
  [
    param('source_id').isUUID().withMessage('Invalid source ID')
  ],
  validate,
  ContextController.getContextSource
);

/**
 * @route   PUT /api/polls/contexts/:source_id
 * @desc    Update context source
 * @access  Private (owner only)
 */
router.put(
  '/contexts/:source_id',
  authenticate,
  [
    param('source_id').isUUID().withMessage('Invalid source ID'),
    body('title').optional().trim().isLength({ min: 5 }).withMessage('Title must be at least 5 characters'),
    body('summary').optional().trim(),
    body('author').optional().trim(),
    body('publisher').optional().trim(),
    body('source_url').optional().isURL().withMessage('Source URL must be valid'),
    body('publication_date').optional().isDate().withMessage('Invalid publication date'),
    body('credibility_score').optional().isFloat({ min: 0, max: 10 }).withMessage('Credibility score must be between 0 and 10'),
    body('tags').optional().isArray().withMessage('Tags must be an array')
  ],
  validate,
  ContextController.updateContextSource
);

/**
 * @route   DELETE /api/polls/contexts/:source_id
 * @desc    Delete context source
 * @access  Private (owner only)
 */
router.delete(
  '/contexts/:source_id',
  authenticate,
  [
    param('source_id').isUUID().withMessage('Invalid source ID')
  ],
  validate,
  ContextController.deleteContextSource
);

/**
 * @route   POST /api/polls/contexts/:source_id/blocks
 * @desc    Add blocks to context source
 * @access  Private (owner only)
 */
router.post(
  '/contexts/:source_id/blocks',
  authenticate,
  [
    param('source_id').isUUID().withMessage('Invalid source ID'),
    body('blocks').isArray().withMessage('Blocks array is required')
  ],
  validate,
  ContextController.addBlocksToSource
);

/**
 * @route   PUT /api/polls/contexts/blocks/:block_id
 * @desc    Update context block
 * @access  Private (owner only)
 */
router.put(
  '/contexts/blocks/:block_id',
  authenticate,
  [
    param('block_id').isUUID().withMessage('Invalid block ID')
  ],
  validate,
  ContextController.updateContextBlock
);

/**
 * @route   DELETE /api/polls/contexts/blocks/:block_id
 * @desc    Delete context block
 * @access  Private (owner only)
 */
router.delete(
  '/contexts/blocks/:block_id',
  authenticate,
  [
    param('block_id').isUUID().withMessage('Invalid block ID')
  ],
  validate,
  ContextController.deleteContextBlock
);

/**
 * @route   POST /api/polls/contexts/:source_id/engage
 * @desc    Record context engagement
 * @access  Public (optionalAuth)
 */
router.post(
  '/contexts/:source_id/engage',
  optionalAuth,
  [
    param('source_id').isUUID().withMessage('Invalid source ID'),
    body('engagement_type')
      .notEmpty().withMessage('Engagement type is required')
      .isIn(['view', 'scroll_complete', 'click_source', 'expand', 'download', 'share'])
      .withMessage('Invalid engagement type'),
    body('poll_id').optional().isUUID().withMessage('Invalid poll ID'),
    body('duration_seconds').optional().isInt({ min: 0 }).withMessage('Duration must be a positive integer'),
    body('scroll_percentage').optional().isInt({ min: 0, max: 100 }).withMessage('Scroll percentage must be between 0 and 100'),
    body('metadata').optional().isObject().withMessage('Metadata must be an object')
  ],
  validate,
  ContextController.recordEngagement
);

/**
 * @route   GET /api/polls/contexts/:source_id/engagements
 * @desc    Get engagement summary for a source
 * @access  Public
 */
router.get(
  '/contexts/:source_id/engagements',
  [
    param('source_id').isUUID().withMessage('Invalid source ID')
  ],
  validate,
  ContextController.getSourceEngagementSummary
);

/**
 * @route   POST /api/polls/:poll_id/contexts
 * @desc    Link context source to poll
 * @access  Private (poll owner only)
 */
router.post(
  '/:poll_id/contexts',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    body('source_id').isUUID().withMessage('Source ID is required'),
    body('display_position')
      .optional()
      .isIn(['pre_poll', 'inline', 'post_poll', 'on_demand'])
      .withMessage('Invalid display position'),
    body('is_required').optional().isBoolean().withMessage('is_required must be boolean'),
    body('order_index').optional().isInt({ min: 0 }).withMessage('order_index must be a positive integer')
  ],
  validate,
  ContextController.linkContextToPoll
);

/**
 * @route   GET /api/polls/:poll_id/contexts
 * @desc    Get contexts for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/contexts',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    query('include_blocks').optional().isBoolean().withMessage('include_blocks must be boolean')
  ],
  validate,
  ContextController.getPollContexts
);

/**
 * @route   GET /api/polls/:poll_id/contexts/required
 * @desc    Get required contexts for a poll
 * @access  Public
 */
router.get(
  '/:poll_id/contexts/required',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  ContextController.getRequiredPollContexts
);

/**
 * @route   GET /api/polls/:poll_id/contexts/engagements
 * @desc    Get engagement summary for poll's contexts
 * @access  Public
 */
router.get(
  '/:poll_id/contexts/engagements',
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  ContextController.getPollContextEngagementSummary
);

/**
 * @route   GET /api/polls/:poll_id/contexts/completion
 * @desc    Check if user has completed required contexts
 * @access  Private
 */
router.get(
  '/:poll_id/contexts/completion',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID')
  ],
  validate,
  ContextController.checkRequiredContextsCompletion
);

/**
 * @route   DELETE /api/polls/:poll_id/contexts/:source_id
 * @desc    Unlink context from poll
 * @access  Private (poll owner only)
 */
router.delete(
  '/:poll_id/contexts/:source_id',
  authenticate,
  [
    param('poll_id').isUUID().withMessage('Invalid poll ID'),
    param('source_id').isUUID().withMessage('Invalid source ID')
  ],
  validate,
  ContextController.unlinkContextFromPoll
);

// ==================== Context Comments Routes ====================

/**
 * @route   POST /api/polls/contexts/:source_id/comments
 * @desc    Create a comment on a context source
 * @access  Private
 */
router.post(
  '/contexts/:source_id/comments',
  authenticate,
  [
    param('source_id').isUUID().withMessage('Invalid source ID'),
    body('comment').trim().notEmpty().withMessage('Comment is required').isLength({ max: 2000 }).withMessage('Comment cannot exceed 2000 characters'),
    body('parent_comment_id').optional().isUUID().withMessage('Invalid parent comment ID')
  ],
  validate,
  ContextController.createContextComment
);

/**
 * @route   GET /api/polls/contexts/:source_id/comments
 * @desc    Get comments for a context source
 * @access  Public
 */
router.get(
  '/contexts/:source_id/comments',
  [
    param('source_id').isUUID().withMessage('Invalid source ID'),
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    query('include_replies').optional().isBoolean().withMessage('include_replies must be boolean'),
    query('parent_comment_id').optional().isUUID().withMessage('Invalid parent comment ID')
  ],
  validate,
  ContextController.getContextComments
);

module.exports = router;
