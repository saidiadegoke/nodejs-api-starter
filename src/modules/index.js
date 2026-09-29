/**
 * Module exports
 * Add new modules here as they are created
 */
module.exports = {
  auth: require('./auth/routes'),
  users: require('./users/routes'),
  assets: require('./assets/routes'),
  websocket: require('./websocket/routes'),
  shared: require('./shared/routes'),
  'api-keys': require('./api-keys/routes'),
  webhooks: require('./webhooks/routes'),
  ocr: require('./ocr/routes'),
};
