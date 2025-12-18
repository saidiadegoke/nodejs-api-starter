const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, requirePermission } = require('../../shared/middleware/rbac.middleware');
const authoringController = require('./controllers/authoring.controller');

// Ensure uploads directory exists
const uploadsDir = 'uploads/authoring/';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['.json', '.csv'];
  const fileExtension = path.extname(file.originalname).toLowerCase();
  
  if (allowedTypes.includes(fileExtension)) {
    cb(null, true);
  } else {
    cb(new Error('Only JSON and CSV files are allowed'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  }
});

// All authoring routes require authentication
router.use(requireAuth);

// Wizard routes (single content creation) - requires 'authoring.create' permission
router.post('/wizard', requirePermission('authoring.create'), authoringController.createWithWizard);
router.get('/wizards', requirePermission('authoring.create'), authoringController.getWizards);

// Bulk creation routes - requires 'authoring.bulk_create' permission
router.post('/bulk-polls', requirePermission('authoring.bulk_create'), authoringController.createBulkPolls);
router.post('/bulk-stories', requirePermission('authoring.bulk_create'), authoringController.createBulkStories);

// New bulk creation route - requires 'authoring.bulk_create' permission
router.post('/bulk-create', requirePermission('authoring.bulk_create'), upload.single('file'), authoringController.bulkCreateFromFile);

// Template download route - requires 'authoring.bulk_create' permission
router.get('/template/:format', requirePermission('authoring.bulk_create'), authoringController.downloadTemplate);

// Template and history routes - requires 'authoring.bulk_create' permission
router.get('/templates', requirePermission('authoring.bulk_create'), authoringController.getTemplates);
router.get('/history', requirePermission('authoring.bulk_create'), authoringController.getAuthoringHistory);

module.exports = router;