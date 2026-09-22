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

async function resolveAttendanceContext(userId, candidateCode = null) {
  return resolveStudentContext(userId, { candidateCode });
}

class AttendanceService {
  static async getHome(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    const attendance = attendanceProviders.get();
    const filters = pickFilterQuery(query);

    const attHomePromise = attendance.getHomeSummary(ctx, filters);
    const unreadPromise = NotificationModel.getUnreadCount(ctx.user_id || userId);

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
    console.info('attHome', attHome);
    const isArray = Array.isArray(attHome);
    const attObj = !isArray && attHome && typeof attHome === 'object' ? attHome : {};
    const classes = isArray ? attHome : (attObj.todays_classes || attObj.classes || []);

    return {
      summary: {
        attendance_percent: attObj.attendance_percent ?? 0,
        average_score_percent: crmsHome.average_score_percent ?? 0,
        subjects_count: crmsHome.subjects_count ?? 0,
        overall_grade: crmsHome.overall_grade ?? null,
      },
      todays_classes: classes,
      attendance_chart: attObj.attendance_chart || null,
      unread_notifications_count: unread,
    };
  }

  static async getSummary(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().getSummary(ctx, pickFilterQuery(query));
  }

  static async getClasses(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().getClasses(ctx, pickFilterQuery(query));
  }

  static async getHistory(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().getHistory(ctx, pickFilterQuery(query));
  }

  static async getCourseSessions(userId, courseCode, query = {}) {
    if (!courseCode || !String(courseCode).trim()) {
      throw httpError(422, 'courseCode is required', { error_code: 'course_code_required' });
    }
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().getCourseSessions(
      ctx,
      String(courseCode).trim(),
      pickFilterQuery(query)
    );
  }

  static async getTimetable(userId, query = {}) {
    const filters = pickFilterQuery(query);
    const validatedMonth = validateMonth(filters.month);
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().getTimetable(ctx, {
      ...filters,
      month: validatedMonth || undefined,
    });
  }

  static async checkIn(userId, classId, payload = {}) {
    const candidateCode = payload.candidate_code || payload.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().checkIn(ctx, classId || payload.lecture_id, payload);
  }

  static async checkOut(userId, classId, payload = {}) {
    const candidateCode = payload.candidate_code || payload.candidateCode;
    const ctx = await resolveAttendanceContext(userId, candidateCode);
    return attendanceProviders.get().checkOut(ctx, classId || payload.lecture_id, payload);
  }

  static async syncStudents(payload) {
    return attendanceProviders.get().syncStudents(payload);
  }

  static async syncInstitutions(payload) {
    return attendanceProviders.get().syncInstitutions(payload);
  }
}

module.exports = AttendanceService;
