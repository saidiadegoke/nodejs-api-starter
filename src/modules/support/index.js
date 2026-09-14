const routes = require('./routes/support.routes');
const service = require('./services/support.service');
const SupportTicketModel = require('./models/support-ticket.model');
const SupportMessageModel = require('./models/support-message.model');

module.exports = {
  routes,
  service,
  SupportTicketModel,
  SupportMessageModel,
};
