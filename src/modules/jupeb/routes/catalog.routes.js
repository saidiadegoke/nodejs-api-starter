const router = require('express').Router();
const { requireAuth, requireRole } = require('../../../shared/middleware/rbac.middleware');
const CatalogController = require('../controllers/catalog.controller');

const catalogWrite = [requireAuth, requireRole('admin', 'super_admin', 'registrar')];

/** Public (preload) */
router.get('/universities/public', CatalogController.listUniversitiesPublic);
router.get('/subject-combinations/public', CatalogController.listSubjectCombinationsPublic);

/** Admin / registrar */
router.get('/universities', catalogWrite, CatalogController.listUniversitiesAdmin);
router.post('/universities', catalogWrite, CatalogController.createUniversity);
router.get('/universities/:universityId', catalogWrite, CatalogController.getUniversityById);
router.patch('/universities/:universityId', catalogWrite, CatalogController.patchUniversity);
router.post('/universities/:universityId/activate', catalogWrite, CatalogController.activateUniversity);
router.post('/universities/:universityId/deactivate', catalogWrite, CatalogController.deactivateUniversity);

router.get('/subject-combinations', catalogWrite, CatalogController.listSubjectCombinationsAdmin);
router.post('/subject-combinations', catalogWrite, CatalogController.createSubjectCombination);
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

module.exports = router;
