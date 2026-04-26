const router = require('express').Router();
const { body, query, param } = require('express-validator');
const { isUUID } = require('validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth, requireRole } = require('../../shared/middleware/rbac.middleware');
const { optionalAuth } = require('../../shared/middleware/optional-auth.middleware');
const PostController = require('./controllers/post.controller');
const PostCommentController = require('./controllers/postComment.controller');
const {
  postReadLimiter,
  postWriteLimiter,
  postCommentLimiter,
  postLikeLimiter,
} = require('./middleware/posts.rateLimit.middleware');

router.get(
  '/search',
  postReadLimiter,
  [query('q').trim().notEmpty(), query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 }), validate],
  PostController.searchPublished
);

router.get('/feed.xml', postReadLimiter, PostController.rssFeed);
router.get('/sitemap.xml', postReadLimiter, PostController.sitemapXml);

router.get(
  '/',
  postReadLimiter,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('q').optional().isString().trim(),
    validate,
  ],
  PostController.listPublished
);

router.get(
  '/mine',
  requireAuth,
  postReadLimiter,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['draft', 'published', 'archived']),
    validate,
  ],
  PostController.listMine
);

router.get(
  '/admin/all',
  requireAuth,
  requireRole('admin', 'super_admin'),
  postReadLimiter,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['draft', 'published', 'archived']),
    query('q').optional().isString().trim(),
    validate,
  ],
  PostController.listAdmin
);

router.get(
  '/admin/comments/pending',
  requireAuth,
  requireRole('admin', 'super_admin'),
  postReadLimiter,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  PostController.listPendingComments
);

router.get(
  '/:postId/comments',
  postReadLimiter,
  optionalAuth,
  [
    param('postId').isUUID(),
    query('layout').optional().isIn(['tree', 'flat']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    validate,
  ],
  PostCommentController.listByPost
);

router.post(
  '/:postId/comments',
  postCommentLimiter,
  requireAuth,
  [
    param('postId').isUUID(),
    body('body').trim().notEmpty().isLength({ max: 10000 }),
    body('parent_id').optional({ nullable: true }).isUUID(),
    body('meta').optional().isObject(),
    validate,
  ],
  PostCommentController.create
);

router.patch(
  '/:postId/comments/:commentId',
  postCommentLimiter,
  requireAuth,
  [
    param('postId').isUUID(),
    param('commentId').isUUID(),
    body('body').trim().notEmpty().isLength({ max: 10000 }),
    validate,
  ],
  PostCommentController.update
);

router.patch(
  '/:postId/comments/:commentId/moderate',
  requireAuth,
  requireRole('admin', 'super_admin'),
  [
    param('postId').isUUID(),
    param('commentId').isUUID(),
    body('status').isIn(['approved', 'rejected', 'spam']),
    validate,
  ],
  PostCommentController.moderate
);

router.post(
  '/:postId/comments/:commentId/like',
  postLikeLimiter,
  requireAuth,
  [param('postId').isUUID(), param('commentId').isUUID(), validate],
  PostCommentController.likeComment
);

router.delete(
  '/:postId/comments/:commentId/like',
  postLikeLimiter,
  requireAuth,
  [param('postId').isUUID(), param('commentId').isUUID(), validate],
  PostCommentController.unlikeComment
);

router.delete(
  '/:postId/comments/:commentId',
  requireAuth,
  [param('postId').isUUID(), param('commentId').isUUID(), validate],
  PostCommentController.remove
);

router.get(
  '/:postId/seo',
  postReadLimiter,
  optionalAuth,
  [param('postId').isUUID(), validate],
  PostController.getSeo
);

router.get(
  '/:postId/media',
  postReadLimiter,
  optionalAuth,
  [param('postId').isUUID(), validate],
  PostController.listPostMedia
);

router.put(
  '/:postId/media',
  postWriteLimiter,
  requireAuth,
  [
    param('postId').isUUID(),
    body('items').isArray(),
    body('items').custom((items) => {
      if (!Array.isArray(items)) return false;
      for (const it of items) {
        if (!it || typeof it.file_id !== 'string' || !isUUID(it.file_id)) {
          throw new Error('Each item must include a valid file_id');
        }
      }
      return true;
    }),
    body('items.*.role').optional().isIn(['featured', 'gallery', 'inline']),
    body('items.*.sort_order').optional().isInt({ min: 0 }),
    validate,
  ],
  PostController.replacePostMedia
);

router.post(
  '/:postId/like',
  postLikeLimiter,
  requireAuth,
  [param('postId').isUUID(), validate],
  PostController.likePost
);

router.delete(
  '/:postId/like',
  postLikeLimiter,
  requireAuth,
  [param('postId').isUUID(), validate],
  PostController.unlikePost
);

router.get(
  '/:postId',
  postReadLimiter,
  optionalAuth,
  [
    param('postId').isUUID(),
    query('include').optional().isString(),
    validate,
  ],
  PostController.getPost
);

router.post(
  '/',
  postWriteLimiter,
  requireAuth,
  [
    body('title').trim().notEmpty().isLength({ max: 500 }),
    body('slug').optional().trim().isLength({ max: 255 }),
    body('body').optional().isString(),
    body('excerpt').optional().isLength({ max: 1000 }),
    body('status').optional().isIn(['draft', 'published', 'archived']),
    body('meta').optional().isObject(),
    body('scheduled_publish_at').optional().isISO8601(),
    body('seo_title').optional().isLength({ max: 200 }),
    body('seo_description').optional().isLength({ max: 500 }),
    body('og_image_file_id').optional({ nullable: true }).isUUID(),
    body('twitter_card').optional().isIn(['summary', 'summary_large_image']),
    body('canonical_url').optional().isString(),
    body('robots_directive').optional().isLength({ max: 80 }),
    validate,
  ],
  PostController.createPost
);

router.put(
  '/:postId',
  postWriteLimiter,
  requireAuth,
  [
    param('postId').isUUID(),
    body('title').optional().trim().notEmpty().isLength({ max: 500 }),
    body('slug').optional().trim().isLength({ max: 255 }),
    body('body').optional().isString(),
    body('excerpt').optional().isLength({ max: 1000 }),
    body('status').optional().isIn(['draft', 'published', 'archived']),
    body('meta').optional().isObject(),
    body('scheduled_publish_at').optional({ nullable: true }).isISO8601(),
    body('seo_title').optional({ nullable: true }).isLength({ max: 200 }),
    body('seo_description').optional({ nullable: true }).isLength({ max: 500 }),
    body('og_image_file_id').optional({ nullable: true }).isUUID(),
    body('twitter_card').optional().isIn(['summary', 'summary_large_image']),
    body('canonical_url').optional({ nullable: true }).isString(),
    body('robots_directive').optional({ nullable: true }).isLength({ max: 80 }),
    validate,
  ],
  PostController.updatePost
);

router.delete(
  '/:postId',
  requireAuth,
  [param('postId').isUUID(), validate],
  PostController.deletePost
);

module.exports = router;
