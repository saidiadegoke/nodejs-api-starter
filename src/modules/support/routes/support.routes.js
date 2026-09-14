const express = require('express');
const router = express.Router();
const SupportController = require('../controllers/support.controller');
const { requireAuth, requirePermission, requireRole } = require('../../../shared/middleware/rbac.middleware');
const { jupebStudentMiddleware } = require('../../jupeb/middleware/jupeb-student.middleware');

const jupebStudent = jupebStudentMiddleware();
const institutionStaff = [requireAuth, requirePermission('candidate.view', 'jupeb.registration.manage')];
const adminAccess = [requireAuth, requirePermission('system.admin')];

// ==========================================
// Public / Student Routes
// ==========================================

// Dropdown categories for mobile / web app
router.get('/categories', SupportController.getCategories);

// Student submit a support ticket
router.post('/tickets', jupebStudent, SupportController.createStudentTicket);

// Student list their own tickets
router.get('/my-tickets', jupebStudent, SupportController.getMyTickets);

// Student view their ticket thread
router.get('/tickets/:ticketId', jupebStudent, SupportController.getMyTicketDetail);

// Student reply to a ticket
router.post('/tickets/:ticketId/messages', jupebStudent, SupportController.addStudentReply);

// ==========================================
// Institution Staff Routes
// ==========================================

// Institution list support tickets for their university
router.get('/institution/tickets', institutionStaff, SupportController.institutionListTickets);

// Institution overview stats
router.get('/institution/stats', institutionStaff, SupportController.institutionStats);

// Institution get single ticket detail + thread
router.get('/institution/tickets/:ticketId', institutionStaff, SupportController.institutionGetTicket);

// Institution reply to student ticket
router.post('/institution/tickets/:ticketId/reply', institutionStaff, SupportController.institutionReply);

// Institution update ticket status (in_progress, resolved, closed)
router.patch('/institution/tickets/:ticketId/status', institutionStaff, SupportController.institutionUpdateStatus);

// ==========================================
// Admin Routes (Global)
// ==========================================

// Admin list all tickets across all institutions
router.get('/admin/tickets', adminAccess, SupportController.adminListTickets);

// Admin global stats
router.get('/admin/stats', adminAccess, SupportController.adminStats);

// Admin get any ticket detail
router.get('/admin/tickets/:ticketId', adminAccess, SupportController.adminGetTicket);

// Admin reply to ticket
router.post('/admin/tickets/:ticketId/reply', adminAccess, SupportController.adminReply);

// Admin update ticket details / assignment / status
router.patch('/admin/tickets/:ticketId', adminAccess, SupportController.adminUpdateTicket);

module.exports = router;
