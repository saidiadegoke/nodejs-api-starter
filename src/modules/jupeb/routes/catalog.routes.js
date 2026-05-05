const express = require('express');
const router = express.Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const CatalogController = require('../controllers/catalog.controller');

const catalogWrite = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];
const csvParser = express.text({ type: ['text/csv', 'application/csv'], limit: '5mb' });

/** Public (preload) */
router.get('/universities/public', CatalogController.listUniversitiesPublic);
router.get('/subject-combinations/public', CatalogController.listSubjectCombinationsPublic);
router.get('/subjects/public', CatalogController.listSubjectsPublic);

/** Admin / registrar */
router.get('/universities', catalogWrite, CatalogController.listUniversitiesAdmin);
router.post('/universities', catalogWrite, CatalogController.createUniversity);
router.post('/universities/bulk', csvParser, catalogWrite, CatalogController.bulkUniversities);
router.get('/universities/:universityId', catalogWrite, CatalogController.getUniversityById);
router.patch('/universities/:universityId', catalogWrite, CatalogController.patchUniversity);
router.post('/universities/:universityId/activate', catalogWrite, CatalogController.activateUniversity);
router.post('/universities/:universityId/deactivate', catalogWrite, CatalogController.deactivateUniversity);

router.get('/subject-combinations', catalogWrite, CatalogController.listSubjectCombinationsAdmin);
router.post('/subject-combinations', catalogWrite, CatalogController.createSubjectCombination);
router.post('/subject-combinations/bulk', csvParser, catalogWrite, CatalogController.bulkSubjectCombinations);
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
router.post('/subjects/bulk', csvParser, catalogWrite, CatalogController.bulkSubjects);
router.get('/subjects/:subjectId', catalogWrite, CatalogController.getSubjectById);
router.patch('/subjects/:subjectId', catalogWrite, CatalogController.patchSubject);
router.post('/subjects/:subjectId/activate', catalogWrite, CatalogController.activateSubject);
router.post('/subjects/:subjectId/deactivate', catalogWrite, CatalogController.deactivateSubject);

module.exports = router;
