const attendanceProviders = require('../../integrations/attendance');
const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');
const NotificationModel = require('../../notifications/models/notification.model');

class StudentDashboardService {
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

  static async getCourses(userId) {
    const ctx = await resolveStudentContext(userId);
    return crmsProviders.get().getCourses(ctx);
  }

  static async getResults(userId) {
    const ctx = await resolveStudentContext(userId);
    return crmsProviders.get().getResults(ctx);
  }
}

module.exports = StudentDashboardService;
