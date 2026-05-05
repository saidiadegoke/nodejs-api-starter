const catalogService = require('../services/catalog.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { NOT_FOUND, CONFLICT, INTERNAL_SERVER_ERROR, CREATED } = require('../../../shared/constants/statusCodes');

function mapPgError(err) {
  if (err && err.code === '23505') {
    return { status: CONFLICT, message: 'Duplicate value violates unique constraint' };
  }
  return { status: INTERNAL_SERVER_ERROR, message: err.message || 'Internal server error' };
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
      const row = await catalogService.createUniversity(req.body);
      return sendSuccess(res, row, 'University created', 201);
    } catch (err) {
      if (err.code === '23505') {
        const m = mapPgError(err);
        return sendError(res, m.message, m.status);
      }
      const status = err.status || INTERNAL_SERVER_ERROR;
      return sendError(res, err.message, status);
    }
  }

  static async patchUniversity(req, res) {
    try {
      const row = await catalogService.patchUniversity(req.params.universityId, req.body);
      return sendSuccess(res, row, 'University updated');
    } catch (err) {
      if (err.code === '23505') {
        const m = mapPgError(err);
        return sendError(res, m.message, m.status);
      }
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async activateUniversity(req, res) {
    try {
      const row = await catalogService.setUniversityStatus(req.params.universityId, 'active');
      return sendSuccess(res, row, 'University activated');
    } catch (err) {
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async deactivateUniversity(req, res) {
    try {
      const row = await catalogService.setUniversityStatus(req.params.universityId, 'inactive');
      return sendSuccess(res, row, 'University deactivated');
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
      return sendSuccess(res, row, 'Subject combination created', 201);
    } catch (err) {
      if (err.code === '23505') {
        const m = mapPgError(err);
        return sendError(res, m.message, m.status);
      }
      const status = err.status || INTERNAL_SERVER_ERROR;
      return sendError(res, err.message, status);
    }
  }

  static async patchSubjectCombination(req, res) {
    try {
      const row = await catalogService.patchSubjectCombination(
        req.params.subjectCombinationId,
        req.body
      );
      return sendSuccess(res, row, 'Subject combination updated');
    } catch (err) {
      if (err.code === '23505') {
        const m = mapPgError(err);
        return sendError(res, m.message, m.status);
      }
      const status = err.status || NOT_FOUND;
      return sendError(res, err.message, status);
    }
  }

  static async activateSubjectCombination(req, res) {
    try {
      const row = await catalogService.setSubjectCombinationStatus(
        req.params.subjectCombinationId,
        'active'
      );
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
      return sendSuccess(res, row, 'Subject combination deactivated');
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

  static async bulkUniversities(req, res) {
    try {
      const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv) || '';
      const data = await catalogService.bulkCreateUniversities(csv);
      return sendSuccess(res, data, 'Universities bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async bulkSubjects(req, res) {
    try {
      const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv) || '';
      const data = await catalogService.bulkCreateSubjects(csv);
      return sendSuccess(res, data, 'Subjects bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async bulkSubjectCombinations(req, res) {
    try {
      const csv = typeof req.body === 'string' ? req.body : (req.body && req.body.csv) || '';
      const data = await catalogService.bulkCreateSubjectCombinations(csv);
      return sendSuccess(res, data, 'Subject combinations bulk processed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = CatalogController;
