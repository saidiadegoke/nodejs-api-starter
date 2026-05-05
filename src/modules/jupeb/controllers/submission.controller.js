const submissionService = require('../services/submission.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR, CONFLICT } = require('../../../shared/constants/statusCodes');

class SubmissionController {
  static async listRequirementsAdmin(req, res) {
    try {
      const { rows, page, limit, total } = await submissionService.listRequirementsAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createRequirement(req, res) {
    try {
      const row = await submissionService.createRequirement(req.body);
      return sendSuccess(res, row, 'Requirement created', CREATED);
    } catch (err) {
      if (err.status === CONFLICT) return sendError(res, err.message, CONFLICT);
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async patchRequirement(req, res) {
    try {
      const row = await submissionService.patchRequirement(req.params.requirementId, req.body);
      return sendSuccess(res, row, 'Requirement updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async activateRequirement(req, res) {
    try {
      const row = await submissionService.setRequirementStatus(req.params.requirementId, 'active');
      return sendSuccess(res, row, 'Requirement activated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deactivateRequirement(req, res) {
    try {
      const row = await submissionService.setRequirementStatus(req.params.requirementId, 'inactive');
      return sendSuccess(res, row, 'Requirement deactivated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getMeRequirements(req, res) {
    try {
      const rows = await submissionService.getMeRequirements(req.user.user_id, req.query.registration_id);
      return sendSuccess(res, rows, 'Requirements with completion');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listMeDocuments(req, res) {
    try {
      const rows = await submissionService.listMeDocuments(req.user.user_id, req.query.registration_id);
      return sendSuccess(res, rows, 'Documents');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async attachMeDocument(req, res) {
    try {
      const row = await submissionService.attachMeDocument(req.user.user_id, req.body);
      return sendSuccess(res, row, 'Document attached', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async patchMeDocument(req, res) {
    try {
      const row = await submissionService.patchMeDocument(req.user.user_id, req.params.documentId, req.body);
      return sendSuccess(res, row, 'Document replaced');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async validateCompleteness(req, res) {
    try {
      const data = await submissionService.validateCompleteness(req.user.user_id, req.body.registration_id);
      return sendSuccess(res, data, 'Completeness');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionListDocuments(req, res) {
    try {
      const rows = await submissionService.institutionListDocuments(
        req.user.user_id,
        req.params.registrationId
      );
      return sendSuccess(res, rows, 'Documents');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionAccept(req, res) {
    try {
      const row = await submissionService.institutionReviewDocument(
        req.user.user_id,
        req.params.documentId,
        'accepted',
        req.body.review_note
      );
      return sendSuccess(res, row, 'Document accepted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionReject(req, res) {
    try {
      const row = await submissionService.institutionReviewDocument(
        req.user.user_id,
        req.params.documentId,
        'rejected',
        req.body.review_note
      );
      return sendSuccess(res, row, 'Document rejected');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = SubmissionController;
