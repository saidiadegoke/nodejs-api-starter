const dashboardService = require('../services/dashboard.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

function pickParams(req) {
  return {
    universityId: req.query.university_id || null,
    sessionId: req.query.session_id || null,
    year: req.query.year || null,
    limit: req.query.limit || null,
  };
}

class DashboardController {
  static async getScope(req, res) {
    try {
      const data = await dashboardService.getScope(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Dashboard scope');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getStatCards(req, res) {
    try {
      const data = await dashboardService.getStatCards(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Dashboard stat cards');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getQuickStats(req, res) {
    try {
      const data = await dashboardService.getQuickStats(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Dashboard quick stats');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getStudentsStatus(req, res) {
    try {
      const data = await dashboardService.getStudentsStatus(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Students status breakdown');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getRegistrationTrends(req, res) {
    try {
      const data = await dashboardService.getRegistrationTrends(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Registration trends');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getSubjectEnrollment(req, res) {
    try {
      const data = await dashboardService.getSubjectEnrollment(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Subject enrollment');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getRecentRegistrations(req, res) {
    try {
      const data = await dashboardService.getRecentRegistrations(pickParams(req), req.user.user_id);
      return sendSuccess(res, data, 'Recent registrations');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Donut chart — institution distribution by university_type
  // (federal / state / private / unspecified).
  static async getInstitutionDistribution(req, res) {
    try {
      const data = await dashboardService.getInstitutionDistribution();
      return sendSuccess(res, data, 'Institution distribution');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Line chart — institutions onboarded over time (current + prev year).
  static async getInstitutionTrends(req, res) {
    try {
      const data = await dashboardService.getInstitutionTrends(pickParams(req));
      return sendSuccess(res, data, 'Institution onboarding trends');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Distribution — enrollment share across subject combinations.
  static async getSubjectCombinationDistribution(req, res) {
    try {
      const data = await dashboardService.getSubjectCombinationDistribution(
        pickParams(req),
        req.user.user_id
      );
      return sendSuccess(res, data, 'Subject combination distribution');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // Registration timeline — opens / closes / cutoffs / now-marker
  // for the Registration Management header card.
  static async getSessionTimeline(req, res) {
    try {
      const data = await dashboardService.getSessionTimeline(pickParams(req));
      return sendSuccess(res, data, 'Session timeline');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = DashboardController;
