const supportService = require('../services/support.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class SupportController {
  /**
   * GET /support/categories
   */
  static async getCategories(req, res) {
    try {
      const categories = supportService.getCategories();
      return sendSuccess(res, categories, 'Support categories retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * POST /support/tickets
   */
  static async createStudentTicket(req, res) {
    try {
      const ticket = await supportService.createStudentTicket(req.user.user_id, req.body);
      return sendSuccess(res, ticket, 'Support ticket submitted successfully', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/my-tickets
   */
  static async getMyTickets(req, res) {
    try {
      const result = await supportService.getMyTickets(req.user.user_id, req.query);
      return sendPaginated(
        res,
        result.rows,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/tickets/:ticketId
   */
  static async getMyTicketDetail(req, res) {
    try {
      const ticket = await supportService.getMyTicketDetail(req.user.user_id, req.params.ticketId);
      return sendSuccess(res, ticket, 'Support ticket retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * POST /support/tickets/:ticketId/messages
   */
  static async addStudentReply(req, res) {
    try {
      const message = await supportService.addStudentReply(
        req.user.user_id,
        req.params.ticketId,
        req.body
      );
      return sendSuccess(res, message, 'Reply added successfully', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/institution/tickets
   */
  static async institutionListTickets(req, res) {
    try {
      const result = await supportService.getInstitutionTickets(req.user.user_id, req.query);
      return sendPaginated(
        res,
        result.rows,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/institution/tickets/:ticketId
   */
  static async institutionGetTicket(req, res) {
    try {
      const ticket = await supportService.getInstitutionTicketDetail(
        req.user.user_id,
        req.params.ticketId
      );
      return sendSuccess(res, ticket, 'Institution support ticket retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * POST /support/institution/tickets/:ticketId/reply
   */
  static async institutionReply(req, res) {
    try {
      const message = await supportService.institutionReply(
        req.user.user_id,
        req.params.ticketId,
        req.body
      );
      return sendSuccess(res, message, 'Institution reply sent successfully', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * PATCH /support/institution/tickets/:ticketId/status
   */
  static async institutionUpdateStatus(req, res) {
    try {
      const ticket = await supportService.updateInstitutionTicketStatus(
        req.user.user_id,
        req.params.ticketId,
        req.body
      );
      return sendSuccess(res, ticket, 'Ticket status updated successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/institution/stats
   */
  static async institutionStats(req, res) {
    try {
      const stats = await supportService.getInstitutionStats(
        req.user.user_id,
        req.query.university_id
      );
      return sendSuccess(res, stats, 'Institution support stats retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/admin/tickets
   */
  static async adminListTickets(req, res) {
    try {
      const result = await supportService.getAdminTickets(req.query);
      return sendPaginated(
        res,
        result.rows,
        result.pagination.page,
        result.pagination.limit,
        result.pagination.total
      );
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/admin/tickets/:ticketId
   */
  static async adminGetTicket(req, res) {
    try {
      const ticket = await supportService.getAdminTicketDetail(req.params.ticketId);
      return sendSuccess(res, ticket, 'Admin support ticket retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * POST /support/admin/tickets/:ticketId/reply
   */
  static async adminReply(req, res) {
    try {
      const message = await supportService.adminReply(
        req.user.user_id,
        req.params.ticketId,
        req.body
      );
      return sendSuccess(res, message, 'Admin reply sent successfully', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * PATCH /support/admin/tickets/:ticketId
   */
  static async adminUpdateTicket(req, res) {
    try {
      const ticket = await supportService.adminUpdateTicket(
        req.user.user_id,
        req.params.ticketId,
        req.body
      );
      return sendSuccess(res, ticket, 'Support ticket updated successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * GET /support/admin/stats
   */
  static async adminStats(req, res) {
    try {
      const stats = await supportService.getAdminStats();
      return sendSuccess(res, stats, 'Admin support stats retrieved successfully');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }
}

module.exports = SupportController;
