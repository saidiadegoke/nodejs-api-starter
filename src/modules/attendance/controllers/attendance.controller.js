const AttendanceService = require('../services/attendance.service');
const { sendSuccess, sendError } = require('../../../utils/utils/response');
const { OK, INTERNAL_SERVER_ERROR } = require('../../../utils/constants/statusCodes');

function statusOf(err) {
  return err.status || err.statusCode || INTERNAL_SERVER_ERROR;
}

class AttendanceController {
  static async getHome(req, res) {
    try {
      const data = await AttendanceService.getHome(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Attendance home', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getSummary(req, res) {
    try {
      const data = await AttendanceService.getSummary(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Attendance summary', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getClasses(req, res) {
    try {
      const data = await AttendanceService.getClasses(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Attendance classes', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getHistory(req, res) {
    try {
      const data = await AttendanceService.getHistory(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Attendance history', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getCourseSessions(req, res) {
    try {
      const data = await AttendanceService.getCourseSessions(
        req.user.user_id,
        req.params.courseCode,
        req.query
      );
      return sendSuccess(res, data, 'Course sessions', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async getTimetable(req, res) {
    try {
      const data = await AttendanceService.getTimetable(req.user.user_id, req.query);
      return sendSuccess(res, data, 'Attendance timetable', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async checkIn(req, res) {
    try {
      const payload = { ...req.query, ...req.body };
      const data = await AttendanceService.checkIn(
        req.user.user_id,
        req.params.classId || payload.lecture_id,
        payload
      );
      return sendSuccess(res, data, 'Checked in successfully', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }

  static async checkOut(req, res) {
    try {
      const payload = { ...req.query, ...req.body };
      const data = await AttendanceService.checkOut(
        req.user.user_id,
        req.params.classId || payload.lecture_id,
        payload
      );
      return sendSuccess(res, data, 'Checked out successfully', OK);
    } catch (err) {
      return sendError(res, err.message, statusOf(err), err.details || null);
    }
  }
}

module.exports = AttendanceController;
