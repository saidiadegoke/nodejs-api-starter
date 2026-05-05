const router = require('express').Router();
const institutionScopeRoutes = require('./routes/institution-scope.routes');
const catalogRoutes = require('./routes/catalog.routes');
const sessionRoutes = require('./routes/session.routes');
const identityRoutes = require('./routes/identity.routes');
const submissionRoutes = require('./routes/submission.routes');
const registrationRoutes = require('./routes/registration.routes');
const financeRoutes = require('./routes/finance.routes');
const academicRoutes = require('./routes/academic.routes');

router.use('/', institutionScopeRoutes);
router.use('/catalog', catalogRoutes);
router.use('/sessions', sessionRoutes);
router.use('/identity', identityRoutes);
router.use('/submission', submissionRoutes);
router.use('/registration', registrationRoutes);
router.use('/finance', financeRoutes);
router.use('/academic', academicRoutes);

module.exports = router;
