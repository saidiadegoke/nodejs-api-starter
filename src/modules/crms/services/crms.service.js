const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');

class CrmsService {
  static async getHomeSummary(userId) {
    const ctx = await resolveStudentContext(userId);
    return crmsProviders.get().getHomeSummary(ctx);
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

module.exports = CrmsService;
