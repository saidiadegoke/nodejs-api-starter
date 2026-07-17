const router = require('express').Router();
const { jupebStudentMiddleware } = require('../jupeb/middleware/jupeb-student.middleware');
const AttendanceController = require('./controllers/attendance.controller');

const jupebStudent = jupebStudentMiddleware();

router.get('/home', jupebStudent, AttendanceController.getHome);
router.get('/summary', jupebStudent, AttendanceController.getSummary);
router.get('/classes', jupebStudent, AttendanceController.getClasses);
router.get('/history', jupebStudent, AttendanceController.getHistory);
router.get('/classes/:courseCode/sessions', jupebStudent, AttendanceController.getCourseSessions);
router.get('/timetable', jupebStudent, AttendanceController.getTimetable);

module.exports = router;
