const catalogService = require('../services/catalog.service');
const AdminAuditService = require('../../admin/services/adminAudit.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { NOT_FOUND, INTERNAL_SERVER_ERROR, CREATED } = require('../../../shared/constants/statusCodes');
const { mapUniqueViolation } = require('../../../shared/utils/pg-unique-violation');

function sendCatalogError(res, err) {
  if (err && err.status) {
    return sendError(res, err.message, err.status, err.details || null);
  }
  const mapped = mapUniqueViolation(err);
  if (mapped) {
    return sendError(res, mapped.message, mapped.status, mapped.details);
  }
  return sendError(res, err.message || 'Internal server error', INTERNAL_SERVER_ERROR);
}

class CatalogController {
  static async listUniversitiesPublic(req, res) {
    try {
      const rows = await catalogService.listUniversitiesPublic({ type: req.query.type });
      return sendSuccess(res, rows, 'Universities retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listSubjectCombinationsPublic(req, res) {
    try {
      const rows = await catalogService.listSubjectCombinationsPublic({
        universityId: req.query.university_id,
      });
      return sendSuccess(res, rows, 'Subject combinations retrieved');
    } catch (err) {
      const status = err.status || INTERNAL_SERVER_ERROR;
      return sendError(res, err.message, status);
    }
  }

  static async listUniversitiesAdmin(req, res) {
    try {
      const { rows, page, limit, total } = await catalogService.listUniversitiesAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
        q: req.query.q,
        sessionId: req.query.session_id || null,
        userId: req.user && req.user.user_id,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getUniversityById(req, res) {
    try {
      const row = await catalogService.getUniversityById(req.params.universityId);
      return sendSuccess(res, row, 'University retrieved');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async createUniversity(req, res) {
    try {
      const row = await catalogService.createUniversity(req.body, req.user && req.user.user_id);
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.university_create',
        resourceType: 'university',
        resourceId: row.id,
        universityId: row.id,
        details: { code: row.code, name: row.name, jupeb_prefix: row.jupeb_prefix },
        req,
      });
      return sendSuccess(res, row, 'University created', CREATED);
    } catch (err) {
      return sendCatalogError(res, err);
    }
  }

  static async patchUniversity(req, res) {
    try {
      const row = await catalogService.patchUniversity(req.params.universityId, req.body);
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.university_update',
        resourceType: 'university',
        resourceId: req.params.universityId,
        universityId: req.params.universityId,
        details: req.body,
        req,
      });
      return sendSuccess(res, row, 'University updated');
    } catch (err) {
      return sendCatalogError(res, err);
    }
  }

  static async activateUniversity(req, res) {
    try {
      const row = await catalogService.setUniversityStatus(req.params.universityId, 'active');
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.university_activate',
        resourceType: 'university',
        resourceId: req.params.universityId,
        universityId: req.params.universityId,
        req,
      });
      return sendSuccess(res, row, 'University activated');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async deactivateUniversity(req, res) {
    try {
      const row = await catalogService.setUniversityStatus(req.params.universityId, 'inactive');
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.university_deactivate',
        resourceType: 'university',
        resourceId: req.params.universityId,
        universityId: req.params.universityId,
        req,
      });
      return sendSuccess(res, row, 'University deactivated');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async deleteUniversity(req, res) {
    try {
      const row = await catalogService.deleteUniversity(req.params.universityId);
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.university_delete',
        resourceType: 'university',
        resourceId: req.params.universityId,
        universityId: req.params.universityId,
        req,
      });
      return sendSuccess(res, row, 'University deleted');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async listSubjectCombinationsAdmin(req, res) {
    try {
      const { rows, page, limit, total } = await catalogService.listSubjectCombinationsAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
        university_id: req.query.university_id,
        q: req.query.q,
        sortBy: req.query.sort_by || req.query.sortBy,
        sortOrder: req.query.sort_order || req.query.sortOrder,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      const status = err.status || INTERNAL_SERVER_ERROR;
      return sendError(res, err.message, status);
    }
  }

  static async getSubjectCombinationById(req, res) {
    try {
      const row = await catalogService.getSubjectCombinationById(req.params.subjectCombinationId, { embedItems: true });
      return sendSuccess(res, row, 'Subject combination retrieved');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async createSubjectCombination(req, res) {
    try {
      const row = await catalogService.createSubjectCombination(req.body);
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.subject_combination_create',
        resourceType: 'subject_combination',
        resourceId: row.id,
        universityId: row.university_id || null,
        details: { code: row.code, title: row.title, is_global: row.is_global },
        req,
      });
      return sendSuccess(res, row, 'Subject combination created', 201);
    } catch (err) {
      return sendCatalogError(res, err);
    }
  }

  static async patchSubjectCombination(req, res) {
    try {
      const row = await catalogService.patchSubjectCombination(
        req.params.subjectCombinationId,
        req.body
      );
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.subject_combination_update',
        resourceType: 'subject_combination',
        resourceId: req.params.subjectCombinationId,
        universityId: row.university_id || null,
        details: req.body,
        req,
      });
      return sendSuccess(res, row, 'Subject combination updated');
    } catch (err) {
      return sendCatalogError(res, err);
    }
  }

  static async activateSubjectCombination(req, res) {
    try {
      const row = await catalogService.setSubjectCombinationStatus(
        req.params.subjectCombinationId,
        'active'
      );
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.subject_combination_activate',
        resourceType: 'subject_combination',
        resourceId: req.params.subjectCombinationId,
        req,
      });
      return sendSuccess(res, row, 'Subject combination activated');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async deactivateSubjectCombination(req, res) {
    try {
      const row = await catalogService.setSubjectCombinationStatus(
        req.params.subjectCombinationId,
        'inactive'
      );
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.subject_combination_deactivate',
        resourceType: 'subject_combination',
        resourceId: req.params.subjectCombinationId,
        req,
      });
      return sendSuccess(res, row, 'Subject combination deactivated');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async deleteSubjectCombination(req, res) {
    try {
      const row = await catalogService.deleteSubjectCombination(req.params.subjectCombinationId);
      AdminAuditService.log({
        actorUserId: req.user && req.user.user_id,
        action: 'catalog.subject_combination_delete',
        resourceType: 'subject_combination',
        resourceId: req.params.subjectCombinationId,
        req,
      });
      return sendSuccess(res, row, 'Subject combination deleted');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  // ----- Subjects -----
  static async listSubjectsPublic(req, res) {
    try {
      const rows = await catalogService.listSubjectsPublic();
      return sendSuccess(res, rows, 'Subjects retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listSubjectsAdmin(req, res) {
    try {
      const { rows, page, limit, total } = await catalogService.listSubjectsAdmin({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
        q: req.query.q,
        sessionId: req.query.session_id || null,
        userId: req.user && req.user.user_id,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getSubjectById(req, res) {
    try {
      const row = await catalogService.getSubjectById(req.params.subjectId);
      return sendSuccess(res, row, 'Subject retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createSubject(req, res) {
    try {
      const row = await catalogService.createSubject(req.body);
      return sendSuccess(res, row, 'Subject created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async patchSubject(req, res) {
    try {
      const row = await catalogService.patchSubject(req.params.subjectId, req.body);
      return sendSuccess(res, row, 'Subject updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async activateSubject(req, res) {
    try {
      const row = await catalogService.setSubjectStatus(req.params.subjectId, 'active');
      return sendSuccess(res, row, 'Subject activated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deactivateSubject(req, res) {
    try {
      const row = await catalogService.setSubjectStatus(req.params.subjectId, 'inactive');
      return sendSuccess(res, row, 'Subject deactivated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deleteSubject(req, res) {
    try {
      const row = await catalogService.deleteSubject(req.params.subjectId);
      return sendSuccess(res, row, 'Subject deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // CSV body is normalized to `req.csvText` by the csv-upload middleware
  // (handles multipart files + text/csv + JSON {csv}). The legacy
  // shapes are still accepted as a fallback so existing clients keep
  // working untouched.
  static _csvFromRequest(req) {
    if (typeof req.csvText === 'string' && req.csvText.length) return req.csvText;
    if (typeof req.body === 'string') return req.body;
    if (req.body && typeof req.body.csv === 'string') return req.body.csv;
    return '';
  }

  static async bulkUniversities(req, res) {
    try {
      const csv = CatalogController._csvFromRequest(req);
      const data = await catalogService.bulkCreateUniversities(csv);
      return sendSuccess(res, data, 'Universities bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async bulkSubjects(req, res) {
    try {
      const csv = CatalogController._csvFromRequest(req);
      const data = await catalogService.bulkCreateSubjects(csv);
      return sendSuccess(res, data, 'Subjects bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async bulkSubjectCombinations(req, res) {
    try {
      const csv = CatalogController._csvFromRequest(req);
      const data = await catalogService.bulkCreateSubjectCombinations(csv);
      return sendSuccess(res, data, 'Subject combinations bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async resendCredentials(req, res) {
    try {
      const { email } = req.body;
      const data = await catalogService.resendCredentials(email);
      return sendSuccess(res, data, 'Welcome credentials email resent successfully');
    } catch (err) {
      return sendCatalogError(res, err);
    }
  }
}

module.exports = CatalogController;
