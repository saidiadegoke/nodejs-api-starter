const express = require('express');
const router = express.Router();
const { requireAuth, requirePermission } = require('../../../shared/middleware/rbac.middleware');
const { csvUpload } = require('../../../shared/middleware/csv-upload.middleware');
const CatalogController = require('../controllers/catalog.controller');

const perm = (action) => [requireAuth, requirePermission(action)];

const csvParser = express.text({ type: ['text/csv', 'application/csv'], limit: '10mb' });
const csvBulk = [csvParser, csvUpload];

/** Public (preload) */
router.get('/universities/public', CatalogController.listUniversitiesPublic);
router.get('/subject-combinations/public', CatalogController.listSubjectCombinationsPublic);
router.get('/subjects/public', CatalogController.listSubjectsPublic);

/** Universities (institutions) */
router.get('/universities', perm('institutions.view'), CatalogController.listUniversitiesAdmin);
router.post('/universities', perm('institutions.create'), CatalogController.createUniversity);
router.post('/universities/bulk', ...csvBulk, perm('institutions.create'), CatalogController.bulkUniversities);
router.post('/universities/resend-credentials', CatalogController.resendCredentials);
router.get('/universities/:universityId', perm('institutions.view'), CatalogController.getUniversityById);
router.patch('/universities/:universityId', perm('institutions.update'), CatalogController.patchUniversity);
router.post('/universities/:universityId/activate', perm('institutions.update'), CatalogController.activateUniversity);
router.post('/universities/:universityId/deactivate', perm('institutions.update'), CatalogController.deactivateUniversity);

/** Subject combinations */
router.get('/subject-combinations', perm('subject_combinations.view'), CatalogController.listSubjectCombinationsAdmin);
router.post('/subject-combinations', perm('subject_combinations.create'), CatalogController.createSubjectCombination);
router.post('/subject-combinations/bulk', ...csvBulk, perm('subject_combinations.create'), CatalogController.bulkSubjectCombinations);
router.get('/subject-combinations/:subjectCombinationId', perm('subject_combinations.view'), CatalogController.getSubjectCombinationById);
router.patch('/subject-combinations/:subjectCombinationId', perm('subject_combinations.update'), CatalogController.patchSubjectCombination);
router.post(
  '/subject-combinations/:subjectCombinationId/activate',
  perm('subject_combinations.update'),
  CatalogController.activateSubjectCombination
);
router.post(
  '/subject-combinations/:subjectCombinationId/deactivate',
  perm('subject_combinations.update'),
  CatalogController.deactivateSubjectCombination
);

/** Subjects */
router.get('/subjects', perm('subject.view'), CatalogController.listSubjectsAdmin);
router.post('/subjects', perm('subject.create'), CatalogController.createSubject);
router.post('/subjects/bulk', ...csvBulk, perm('subject.create'), CatalogController.bulkSubjects);
router.get('/subjects/:subjectId', perm('subject.view'), CatalogController.getSubjectById);
router.patch('/subjects/:subjectId', perm('subject.update'), CatalogController.patchSubject);
router.post('/subjects/:subjectId/activate', perm('subject.update'), CatalogController.activateSubject);
router.post('/subjects/:subjectId/deactivate', perm('subject.update'), CatalogController.deactivateSubject);

module.exports = router;
