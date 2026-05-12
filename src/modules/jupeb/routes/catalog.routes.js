const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { csvUpload } = require('../../../shared/middleware/csv-upload.middleware');
const CatalogController = require('../controllers/catalog.controller');

const catalogWrite = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
// Bulk CSV ingestion: accepts text/csv, JSON {csv:""}, or multipart file.
// express.text() runs in parallel to handle the text/csv body case;
// csvUpload normalizes all three shapes onto `req.csvText`.
const csvParser = express.text({ type: ['text/csv', 'application/csv'], limit: '10mb' });
const csvBulk = [csvParser, csvUpload];

/** Public (preload) */
router.get('/universities/public', CatalogController.listUniversitiesPublic);
router.get('/subject-combinations/public', CatalogController.listSubjectCombinationsPublic);
router.get('/subjects/public', CatalogController.listSubjectsPublic);

/** Admin / registrar */
router.get('/universities', catalogWrite, CatalogController.listUniversitiesAdmin);
router.post('/universities', catalogWrite, CatalogController.createUniversity);
router.post('/universities/bulk', ...csvBulk, catalogWrite, CatalogController.bulkUniversities);
router.get('/universities/:universityId', catalogWrite, CatalogController.getUniversityById);
router.patch('/universities/:universityId', catalogWrite, CatalogController.patchUniversity);
router.post('/universities/:universityId/activate', catalogWrite, CatalogController.activateUniversity);
router.post('/universities/:universityId/deactivate', catalogWrite, CatalogController.deactivateUniversity);

router.get('/subject-combinations', catalogWrite, CatalogController.listSubjectCombinationsAdmin);
router.post('/subject-combinations', catalogWrite, CatalogController.createSubjectCombination);
router.post('/subject-combinations/bulk', ...csvBulk, catalogWrite, CatalogController.bulkSubjectCombinations);
router.get('/subject-combinations/:subjectCombinationId', catalogWrite, CatalogController.getSubjectCombinationById);
router.patch('/subject-combinations/:subjectCombinationId', catalogWrite, CatalogController.patchSubjectCombination);
router.post(
  '/subject-combinations/:subjectCombinationId/activate',
  catalogWrite,
  CatalogController.activateSubjectCombination
);
router.post(
  '/subject-combinations/:subjectCombinationId/deactivate',
  catalogWrite,
  CatalogController.deactivateSubjectCombination
);

router.get('/subjects', catalogWrite, CatalogController.listSubjectsAdmin);
router.post('/subjects', catalogWrite, CatalogController.createSubject);
router.post('/subjects/bulk', ...csvBulk, catalogWrite, CatalogController.bulkSubjects);
router.get('/subjects/:subjectId', catalogWrite, CatalogController.getSubjectById);
router.patch('/subjects/:subjectId', catalogWrite, CatalogController.patchSubject);
router.post('/subjects/:subjectId/activate', catalogWrite, CatalogController.activateSubject);
router.post('/subjects/:subjectId/deactivate', catalogWrite, CatalogController.deactivateSubject);

module.exports = router;
