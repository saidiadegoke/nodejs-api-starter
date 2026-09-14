const crypto = require('crypto');
const pool = require('../../../db/pool');
const SupportTicketModel = require('../models/support-ticket.model');
const SupportMessageModel = require('../models/support-message.model');
const registrationModel = require('../../jupeb/models/registration.model');
const sendEmail = require('../../../shared/utils/sendEmail');
const {
  assertInstitutionUniversityAccess,
  effectiveInstitutionListUniversityId,
  getProfileJupebUniversityId,
} = require('../../jupeb/utils/institution-scope');
const {
  SUPPORT_CATEGORIES,
  validateCreateTicket,
  validateReplyMessage,
  validateUpdateStatus,
} = require('../validations/support.validation');

function httpError(status, message, details = null) {
  const err = new Error(message);
  err.status = status;
  if (details) err.details = details;
  return err;
}

function isUuid(str) {
  return typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(str);
}

function generateTicketNumber() {
  const d = new Date();
  const yearMonth = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`;
  const randomSuffix = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${yearMonth}-${randomSuffix}`;
}

class SupportService {
  /**
   * Return predefined support categories for app dropdown.
   */
  getCategories() {
    return SUPPORT_CATEGORIES;
  }

  /**
   * Student submits a support ticket from mobile/web app.
   */
  async createStudentTicket(userId, body) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    const v = validateCreateTicket(body);
    if (!v.ok) throw httpError(422, v.error);

    // 1. Resolve user profile and contact info
    const userRes = await pool.query(
      `SELECT u.id, u.email, p.first_name, p.last_name, p.jupeb_university_id
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
        WHERE u.id = $1 LIMIT 1`,
      [userId]
    );
    const user = userRes.rows[0];
    if (!user) throw httpError(404, 'User not found');

    // 2. Resolve candidate registration & institution
    let universityId = user.jupeb_university_id || null;
    let registrationId = null;
    try {
      const reg = await registrationModel.findLatestForUser(userId);
      if (reg) {
        registrationId = reg.id;
        if (reg.university_id) {
          universityId = reg.university_id;
        }
      }
    } catch (_) {
      // Non-fatal if no registration yet
    }

    // 3. Generate ticket number and persist
    let ticketNumber;
    let ticket;
    for (let attempts = 0; attempts < 5; attempts++) {
      ticketNumber = generateTicketNumber();
      try {
        ticket = await SupportTicketModel.create({
          ticket_number: ticketNumber,
          user_id: userId,
          university_id: universityId,
          registration_id: registrationId,
          category: v.data.category,
          subject: v.data.subject,
          message: v.data.message,
          priority: v.data.priority,
          status: 'open',
        });
        break;
      } catch (err) {
        if (err.code === '23505') continue; // Collision on ticket_number, retry
        throw err;
      }
    }
    if (!ticket) throw httpError(500, 'Failed to generate unique ticket reference');

    // 4. Create initial message in conversation thread
    await SupportMessageModel.create({
      ticket_id: ticket.id,
      sender_id: userId,
      sender_role: 'student',
      message: v.data.message,
    });

    // 5. Fire non-blocking confirmation email to student
    if (user.email) {
      sendEmail({
        to: user.email,
        subject: `[${ticket.ticket_number}] Support Request Received: ${ticket.subject}`,
        templateFile: 'support-ticket-created.html',
        placeholders: {
          firstName: user.first_name || 'Student',
          category: ticket.category,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          message: ticket.message,
          email: user.email,
          year: String(new Date().getFullYear()),
          appName: 'JUPEB Portal',
        },
      }).catch(() => {});
    }

    return ticket;
  }

  /**
   * Student views their submitted tickets.
   */
  async getMyTickets(userId, query = {}) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    return SupportTicketModel.listMyTickets(userId, query);
  }

  /**
   * Student views a specific ticket with message thread.
   */
  async getMyTicketDetail(userId, ticketId) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');

    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw httpError(404, 'Support ticket not found');
    }

    const messages = await SupportMessageModel.findByTicketId(ticketId);
    return { ...ticket, messages };
  }

  /**
   * Student adds a follow-up reply.
   */
  async addStudentReply(userId, ticketId, body) {
    if (!isUuid(userId)) throw httpError(422, 'Invalid user id');
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const v = validateReplyMessage(body);
    if (!v.ok) throw httpError(422, v.error);

    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket || ticket.user_id !== userId) {
      throw httpError(404, 'Support ticket not found');
    }

    const msg = await SupportMessageModel.create({
      ticket_id: ticketId,
      sender_id: userId,
      sender_role: 'student',
      message: v.data.message,
      attachments: v.data.attachments,
    });

    // If ticket was resolved/closed, reopen it
    if (ticket.status === 'resolved' || ticket.status === 'closed') {
      await SupportTicketModel.updateStatus(ticketId, 'open');
    }

    return msg;
  }

  /**
   * Institution gets all support tickets submitted in their institution.
   */
  async getInstitutionTickets(actorUserId, query = {}) {
    if (!isUuid(actorUserId)) throw httpError(422, 'Invalid user id');
    const universityId = await effectiveInstitutionListUniversityId(actorUserId, query.university_id);
    if (!universityId) {
      throw httpError(403, 'Institution user must be linked to a university');
    }
    return SupportTicketModel.listInstitutionTickets(universityId, query);
  }

  /**
   * Institution views a single ticket detail + messages thread.
   */
  async getInstitutionTicketDetail(actorUserId, ticketId) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');

    if (ticket.university_id) {
      await assertInstitutionUniversityAccess(actorUserId, ticket.university_id);
    } else {
      // Unassigned tickets cannot be accessed by institution role without university match
      const scoped = await getProfileJupebUniversityId(actorUserId);
      if (scoped) throw httpError(403, 'Ticket does not belong to your institution');
    }

    const messages = await SupportMessageModel.findByTicketId(ticketId);
    return { ...ticket, messages };
  }

  /**
   * Institution replies to student support ticket.
   */
  async institutionReply(actorUserId, ticketId, body) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const v = validateReplyMessage(body);
    if (!v.ok) throw httpError(422, v.error);

    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');
    if (ticket.university_id) {
      await assertInstitutionUniversityAccess(actorUserId, ticket.university_id);
    }

    const msg = await SupportMessageModel.create({
      ticket_id: ticketId,
      sender_id: actorUserId,
      sender_role: 'institution',
      message: v.data.message,
      attachments: v.data.attachments,
    });

    // Mark status as in_progress if currently open
    if (ticket.status === 'open') {
      await SupportTicketModel.updateStatus(ticketId, 'in_progress');
    }

    // Get staff name & university name for email
    const staffRes = await pool.query(
      `SELECT p.first_name, p.last_name, uni.name AS university_name
         FROM users u
         LEFT JOIN profiles p ON p.user_id = u.id
         LEFT JOIN jupeb_universities uni ON uni.id = $2
        WHERE u.id = $1 LIMIT 1`,
      [actorUserId, ticket.university_id]
    );
    const staff = staffRes.rows[0] || {};
    const responderName = [staff.first_name, staff.last_name].filter(Boolean).join(' ') || 'Institution Support';
    const institutionName = staff.university_name || ticket.university_name || 'Your Institution';

    // Notify student via email
    if (ticket.user_email) {
      sendEmail({
        to: ticket.user_email,
        subject: `Reply on [${ticket.ticket_number}]: ${ticket.subject}`,
        templateFile: 'support-ticket-reply.html',
        placeholders: {
          firstName: ticket.first_name || 'Student',
          responderName,
          institutionName,
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          replyMessage: v.data.message,
          email: ticket.user_email,
          year: String(new Date().getFullYear()),
          appName: 'JUPEB Portal',
        },
      }).catch(() => {});
    }

    return msg;
  }

  /**
   * Institution updates ticket status (e.g. mark resolved/closed).
   */
  async updateInstitutionTicketStatus(actorUserId, ticketId, body) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const v = validateUpdateStatus(body);
    if (!v.ok) throw httpError(422, v.error);

    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');
    if (ticket.university_id) {
      await assertInstitutionUniversityAccess(actorUserId, ticket.university_id);
    }

    return SupportTicketModel.updateStatus(ticketId, v.data.status, {
      resolved_by: actorUserId,
      resolution_notes: v.data.resolution_notes,
    });
  }

  /**
   * Institution support overview stats.
   */
  async getInstitutionStats(actorUserId, queryUniversityId = null) {
    const universityId = await effectiveInstitutionListUniversityId(actorUserId, queryUniversityId);
    if (!universityId) {
      throw httpError(403, 'Institution user must be linked to a university');
    }
    return SupportTicketModel.getInstitutionStats(universityId);
  }

  /**
   * Admin lists all tickets system-wide across all institutions.
   */
  async getAdminTickets(query = {}) {
    return SupportTicketModel.listAdminTickets(query);
  }

  /**
   * Admin views ticket detail.
   */
  async getAdminTicketDetail(ticketId) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');
    const messages = await SupportMessageModel.findByTicketId(ticketId);
    return { ...ticket, messages };
  }

  /**
   * Admin replies to ticket.
   */
  async adminReply(actorUserId, ticketId, body) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const v = validateReplyMessage(body);
    if (!v.ok) throw httpError(422, v.error);

    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');

    const msg = await SupportMessageModel.create({
      ticket_id: ticketId,
      sender_id: actorUserId,
      sender_role: 'admin',
      message: v.data.message,
      attachments: v.data.attachments,
    });

    if (ticket.status === 'open') {
      await SupportTicketModel.updateStatus(ticketId, 'in_progress');
    }

    // Notify student via email
    if (ticket.user_email) {
      sendEmail({
        to: ticket.user_email,
        subject: `Reply on [${ticket.ticket_number}]: ${ticket.subject}`,
        templateFile: 'support-ticket-reply.html',
        placeholders: {
          firstName: ticket.first_name || 'Student',
          responderName: 'JUPEB Support Desk',
          institutionName: 'JUPEB National Secretariat',
          ticketNumber: ticket.ticket_number,
          subject: ticket.subject,
          replyMessage: v.data.message,
          email: ticket.user_email,
          year: String(new Date().getFullYear()),
          appName: 'JUPEB Portal',
        },
      }).catch(() => {});
    }

    return msg;
  }

  /**
   * Admin updates ticket (priority, assigned_to, status, notes).
   */
  async adminUpdateTicket(actorUserId, ticketId, body) {
    if (!isUuid(ticketId)) throw httpError(422, 'Invalid ticket id');
    const ticket = await SupportTicketModel.findById(ticketId);
    if (!ticket) throw httpError(404, 'Support ticket not found');

    const fields = {};
    if (body.priority) fields.priority = String(body.priority).toLowerCase();
    if (body.category) fields.category = String(body.category).trim();
    if (body.assigned_to !== undefined) fields.assigned_to = body.assigned_to;
    if (body.resolution_notes !== undefined) fields.resolution_notes = body.resolution_notes;

    if (body.status) {
      return SupportTicketModel.updateStatus(ticketId, String(body.status).toLowerCase(), {
        resolved_by: actorUserId,
        resolution_notes: body.resolution_notes,
      });
    }

    return SupportTicketModel.update(ticketId, fields);
  }

  /**
   * Admin support stats.
   */
  async getAdminStats() {
    return SupportTicketModel.getAdminStats();
  }
}

module.exports = new SupportService();
