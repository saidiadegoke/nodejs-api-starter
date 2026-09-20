const attendanceProviders = require('../../integrations/attendance');
const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');
const resultsReleaseService = require('./results-release.service');

class StudentDashboardService {
  static async getHome(userId, query = {}) {
    // Reuse attendance home composition (supports optional upstream identity overrides).
    // eslint-disable-next-line global-require
    const AttendanceService = require('../../attendance/services/attendance.service');
    return AttendanceService.getHome(userId, query);
  }

  static async getCourses(userId) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getCourses(ctx);
  }

  static async getResults(userId) {
    const ctx = await resolveStudentContext(userId);
    await resultsReleaseService.checkStudentReleaseAccess(ctx);
    return crmsProviders.get().getResults(ctx);
  }

  static async checkIn(userId, classId, payload, query = {}) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().checkIn(ctx, classId, payload);
  }

  static async checkOut(userId, classId, payload, query = {}) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().checkOut(ctx, classId, payload);
  }
}

module.exports = StudentDashboardService;
