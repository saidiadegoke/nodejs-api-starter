const ApiKeyService = require('../../modules/api-keys/services/apiKey.service');
const { sendError } = require('../utils/response');
const { UNAUTHORIZED } = require('../constants/statusCodes');

/**
 * API Key authentication middleware.
 *
 * Inspects the Bearer token — if it starts with `sk_`, it's treated as an
 * API key and authenticated against the api_keys table. Otherwise, passthrough
 * so JWT middleware further down the chain can handle it.
 *
 * Mount this BEFORE requireAuth/authenticate on routes that should accept both
 * JWT and API-key auth.
 */
const apiKeyAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (!token || !token.startsWith('sk_')) {
    return next();
  }

  try {
    const keyRecord = await ApiKeyService.authenticate(token);
    req.user = {
      user_id: keyRecord.user_id,
      auth_method: 'api_key',
    };
    return next();
  } catch (error) {
    return sendError(res, 'Invalid API key', UNAUTHORIZED);
  }
};

module.exports = { apiKeyAuth };
