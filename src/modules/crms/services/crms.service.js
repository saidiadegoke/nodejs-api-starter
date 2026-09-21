const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');
const resultsReleaseService = require('../../jupeb/services/results-release.service');

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
    await resultsReleaseService.checkStudentReleaseAccess(ctx);
    return crmsProviders.get().getResults(ctx);
  }

  static async syncCandidates(candidates) {
    return crmsProviders.get().syncCandidates(candidates);
  }

  static async syncInstitutions(institutions) {
    return crmsProviders.get().syncInstitutions(institutions);
  }
}

module.exports = CrmsService;
