/**
 * Module exports
 * Add new modules here as they are created
 */
module.exports = {
  auth: require('./auth/routes'),
  users: require('./users/routes'),
  files: require('./files/routes'),
  orders: require('./orders/routes'),
  polls: require('./polls/routes'),
};
