const { getNestApp } = require('./nest-app-factory');
let expressApp;

/**
 * Returns either the legacy Express application or the NestJS application
 * based on the process.env.UNDER_TEST environment variable.
 *
 * - UNDER_TEST=nest -> Boots and returns the NestJS app (underlying Express instance)
 * - Default / other -> Returns the legacy Express app
 */
async function getAppUnderTest() {
  if (process.env.UNDER_TEST === 'nest') {
    return await getNestApp();
  }
  if (!expressApp) {
    expressApp = require('../../app');
  }
  return expressApp;
}

module.exports = { getAppUnderTest };
