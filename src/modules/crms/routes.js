const router = require('express').Router();
const { jupebStudentMiddleware } = require('../jupeb/middleware/jupeb-student.middleware');
const CrmsController = require('./controllers/crms.controller');

const jupebStudent = jupebStudentMiddleware();

router.get('/home', jupebStudent, CrmsController.getHomeSummary);
router.get('/courses', jupebStudent, CrmsController.getCourses);
router.get('/results', jupebStudent, CrmsController.getResults);

module.exports = router;
