const router = require('express').Router();
const { requireAuth } = require('../../utils/middleware/rbac.middleware');
const { uploadSingle } = require('../../utils/middleware/upload.middleware');
const OcrController = require('./controllers/ocr.controller');

router.get('/health', (req, res) => {
  res.json({ success: true, module: 'ocr', status: 'ok' });
});

router.post(
  '/jobs',
  requireAuth,
  (req, res, next) => {
    const ct = (req.headers['content-type'] || '').toLowerCase();
    if (ct.startsWith('multipart/form-data')) {
      return uploadSingle('file')(req, res, next);
    }
    return next();
  },
  OcrController.createJob
);

router.get('/jobs', requireAuth, OcrController.listJobs);
router.get('/jobs/:jobId', requireAuth, OcrController.getJob);
router.post('/jobs/:jobId/retry', requireAuth, OcrController.retryJob);
router.post('/jobs/:jobId/bind-requirement', requireAuth, OcrController.bindRequirement);
router.get('/files/:fileId/latest', requireAuth, OcrController.getLatestForFile);

// Manual result entry — student submits grades without uploading a document
router.post('/manual-entry', requireAuth, OcrController.createManualEntry);

// Static reference list — no auth required (needed before login on registration flow)
router.get('/subjects', OcrController.getSubjects);

module.exports = router;
