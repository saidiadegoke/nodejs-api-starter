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

/** Optional upstream filter query params (identity is handled in student-context). */
function pickFilterQuery(query = {}) {
  const out = {};
  for (const key of ['q', 'month']) {
    const v = query[key];
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      out[key] = String(v).trim();
    }
  }
  return out;
}

async function resolveAttendanceContext(userId) {
  return resolveStudentContext(userId);
}

class AttendanceService {
  static async getHome(userId, query = {}) {
    const ctx = await resolveAttendanceContext(userId);
    const attendance = attendanceProviders.get();
    const filters = pickFilterQuery(query);

    const attHomePromise = attendance.getHomeSummary(ctx, filters);
    const unreadPromise = NotificationModel.getUnreadCount(userId);

    // CRMS needs a real CRP registration; skip gracefully for synthetic/mock contexts.
    let crmsHome = {};
    if (!ctx.synthetic) {
      try {
        crmsHome = await crmsProviders.get().getHomeSummary(ctx);
      } catch {
        crmsHome = {};
      }
    }

    const [attHome, unread] = await Promise.all([attHomePromise, unreadPromise]);

    // const isArray = Array.isArray(attHome);
    // const attObj = !isArray && attHome && typeof attHome === 'object' ? attHome : {};
    // const classes = isArray ? attHome : (attObj.todays_classes || attObj.classes || []);

    return {
      summary: {
        ...crmsHome,
        ...attHome,
      },
      todays_classes: attHome.todays_classes || attHome.classes || [],
      attendance_chart: attHome.attendance_chart || null,
      unread_notifications_count: unread,
    };
  }

  static async getSummary(userId, query = {}) {
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().getSummary(ctx, pickFilterQuery(query));
  }

  static async getClasses(userId, query = {}) {
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().getClasses(ctx, pickFilterQuery(query));
  }

  static async getHistory(userId, query = {}) {
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().getHistory(ctx, pickFilterQuery(query));
  }

  static async getCourseSessions(userId, courseCode, query = {}) {
    if (!courseCode || !String(courseCode).trim()) {
      throw httpError(422, 'courseCode is required', { error_code: 'course_code_required' });
    }
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().getCourseSessions(
      ctx,
      String(courseCode).trim(),
      pickFilterQuery(query)
    );
  }

  static async getTimetable(userId, query = {}) {
    const filters = pickFilterQuery(query);
    const validatedMonth = validateMonth(filters.month);
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().getTimetable(ctx, {
      ...filters,
      month: validatedMonth || undefined,
    });
  }

  static async checkIn(userId, classId, payload = {}) {
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().checkIn(ctx, classId || payload.lecture_id, payload);
  }

  static async checkOut(userId, classId, payload = {}) {
    const ctx = await resolveAttendanceContext(userId);
    return attendanceProviders.get().checkOut(ctx, classId || payload.lecture_id, payload);
  }
}

module.exports = AttendanceService;
