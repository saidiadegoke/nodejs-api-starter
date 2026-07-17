const attendanceProviders = require('../../integrations/attendance');
const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');
const NotificationModel = require('../../notifications/models/notification.model');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function validateMonth(month) {
  if (month === undefined || month === null || month === '') return null;
  if (!/^\d{4}-\d{2}$/.test(String(month))) {
    throw httpError(422, 'month must be YYYY-MM', { error_code: 'month_invalid' });
  }
  return String(month);
}

class AttendanceService {
  static async getHome(userId) {
    const ctx = await resolveStudentContext(userId);
    const attendance = attendanceProviders.get();
    const crms = crmsProviders.get();

    const [attHome, crmsHome, unread] = await Promise.all([
      attendance.getHomeSummary(ctx),
      crms.getHomeSummary(ctx),
      NotificationModel.getUnreadCount(userId),
    ]);

    return {
      summary: {
        attendance_percent: attHome.attendance_percent ?? 0,
        average_score_percent: crmsHome.average_score_percent ?? 0,
        subjects_count: crmsHome.subjects_count ?? 0,
        overall_grade: crmsHome.overall_grade ?? null,
      },
      todays_classes: attHome.todays_classes || [],
      attendance_chart: attHome.attendance_chart || null,
      unread_notifications_count: unread,
    };
  }

  static async getSummary(userId) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getSummary(ctx);
  }

  static async getClasses(userId, { q } = {}) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getClasses(ctx, { q: q || undefined });
  }

  static async getHistory(userId, { q } = {}) {
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getHistory(ctx, { q: q || undefined });
  }

  static async getCourseSessions(userId, courseCode, { q } = {}) {
    if (!courseCode || !String(courseCode).trim()) {
      throw httpError(422, 'courseCode is required', { error_code: 'course_code_required' });
    }
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getCourseSessions(ctx, String(courseCode).trim(), {
      q: q || undefined,
    });
  }

  static async getTimetable(userId, { month } = {}) {
    const validatedMonth = validateMonth(month);
    const ctx = await resolveStudentContext(userId);
    return attendanceProviders.get().getTimetable(ctx, { month: validatedMonth || undefined });
  }
}

module.exports = AttendanceService;
