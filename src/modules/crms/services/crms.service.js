const crmsProviders = require('../../integrations/crms');
const { resolveStudentContext } = require('../../integrations/student-context');
const resultsReleaseService = require('../../jupeb/services/results-release.service');

class CrmsService {
  static async getHomeSummary(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveStudentContext(userId, { candidateCode });
    return crmsProviders.get().getHomeSummary(ctx);
  }

  static async getCourses(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveStudentContext(userId, { candidateCode });
    return crmsProviders.get().getCourses(ctx);
  }

  static async getResults(userId, query = {}) {
    const candidateCode = query.candidate_code || query.candidateCode;
    const ctx = await resolveStudentContext(userId, { candidateCode });
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
