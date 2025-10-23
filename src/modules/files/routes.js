const router = require('express').Router();
const FileController = require('./controllers/file.controller');
const { body } = require('express-validator');
const { validate } = require('../../shared/validations/validator');
const { requireAuth } = require('../../shared/middleware/rbac.middleware');

/**
 * @route   POST /api/files/upload
 * @desc    Upload single file
 * @access  Private
 */
router.post('/upload', requireAuth, FileController.uploadFile);

/**
 * @route   POST /api/files/upload-base64
 * @desc    Upload file from base64
 * @access  Private
 */
router.post(
  '/upload-base64',
  requireAuth,
  [
    body('file_data').notEmpty().withMessage('File data is required'),
    body('context').optional().isString(),
    validate
  ],
  FileController.uploadBase64
);

/**
 * @route   POST /api/files/upload-batch
 * @desc    Upload multiple files
 * @access  Private
 */
router.post('/upload-batch', requireAuth, FileController.uploadBatch);

/**
 * @route   POST /api/files/batch
 * @desc    Create file records from metadata (for testing/mock uploads)
 * @access  Private
 */
router.post('/batch', requireAuth, FileController.createFromMetadata);

/**
 * @route   GET /api/files/:file_id
 * @desc    Get file details
 * @access  Private
 */
router.get('/:file_id', requireAuth, FileController.getFile);

/**
 * @route   DELETE /api/files/:file_id
 * @desc    Delete file
 * @access  Private
 */
router.delete('/:file_id', requireAuth, FileController.deleteFile);

module.exports = router;

