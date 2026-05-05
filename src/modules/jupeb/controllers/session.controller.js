const sessionService = require('../services/session.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const {
  CREATED,
  NOT_FOUND,
  CONFLICT,
  INTERNAL_SERVER_ERROR,
} = require('../../../shared/constants/statusCodes');

class SessionController {
  static async exportCsv(req, res) {
    try {
      const csv = await sessionService.exportCsv();
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="sessions.csv"');
      res.status(200).send(csv);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async list(req, res) {
    try {
      const { rows, page, limit, total } = await sessionService.list({
        page: req.query.page,
        limit: req.query.limit,
        status: req.query.status,
      });
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async create(req, res) {
    try {
      const row = await sessionService.create(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Session created', CREATED);
    } catch (err) {
      if (err.status) return sendError(res, err.message, err.status);
      if (err.code === '23505') {
        return sendError(res, 'Duplicate academic_year', CONFLICT);
      }
      return sendError(res, err.message, INTERNAL_SERVER_ERROR);
    }
  }

  static async getById(req, res) {
    try {
      const row = await sessionService.getById(req.params.sessionId);
      return sendSuccess(res, row, 'Session retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || NOT_FOUND);
    }
  }

  static async patch(req, res) {
    try {
      const row = await sessionService.patch(req.params.sessionId, req.body, req.user.user_id);
      return sendSuccess(res, row, 'Session updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async stats(req, res) {
    try {
      const data = await sessionService.stats(req.params.sessionId, req.query);
      return sendSuccess(res, data, 'Session stats');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async open(req, res) {
    try {
      const row = await sessionService.open(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, row, 'Session opened');
    } catch (err) {
      if (err.status === CONFLICT) return sendError(res, err.message, CONFLICT);
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async close(req, res) {
    try {
      const row = await sessionService.close(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, row, 'Session closed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async reopen(req, res) {
    try {
      const row = await sessionService.reopen(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, row, 'Session reopened');
    } catch (err) {
      if (err.status === CONFLICT) return sendError(res, err.message, CONFLICT);
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async finalize(req, res) {
    try {
      const data = await sessionService.finalizeCandidateNumbers(
        req.params.sessionId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Finalization accepted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = SessionController;
