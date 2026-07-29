const User = require('../../users/models/user.model');
const SsoTokenService = require('../services/sso-token.service');
const {
  getSsoConfig,
  listConfiguredTargets,
  resolveLaunchCallbackUrl,
  SSO_TARGET_APPS,
} = require('../../../shared/config/sso-keys.config');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const {
  BAD_REQUEST,
  SERVICE_UNAVAILABLE,
} = require('../../../shared/constants/statusCodes');

class SsoController {
  static listTargets(req, res) {
    const config = getSsoConfig();
    if (!config.enabled) {
      return sendSuccess(res, {
        enabled: false,
        issuer: null,
        targets: [],
      });
    }

    return sendSuccess(res, {
      enabled: true,
      issuer: config.issuer,
      targets: listConfiguredTargets(),
    });
  }

  static async launch(req, res) {
    const config = getSsoConfig();
    if (!config.enabled) {
      return sendError(res, 'SSO issuer is not configured', SERVICE_UNAVAILABLE);
    }

    const { targetApp } = req.params;
    if (!SSO_TARGET_APPS.includes(targetApp)) {
      return sendError(res, 'Invalid SSO target application', BAD_REQUEST);
    }

    const callbackUrl = resolveLaunchCallbackUrl(
      targetApp,
      req.query.redirect_uri || req.query.callback_url
    );
    if (!callbackUrl) {
      return sendError(
        res,
        'A valid redirect_uri (or callback_url) query parameter is required',
        BAD_REQUEST
      );
    }

    try {
      const user = await User.findById(req.user.user_id);
      if (!user) {
        return sendError(res, 'User not found', BAD_REQUEST);
      }

      const token = await SsoTokenService.issueHandoffToken({ user, targetApp });
      const redirectUrl = new URL(callbackUrl);
      redirectUrl.searchParams.set('token', token);
      return res.json({ redirectUrl: redirectUrl.toString() });
    } catch (error) {
      const status = /email|institution|user/i.test(error.message)
        ? BAD_REQUEST
        : SERVICE_UNAVAILABLE;
      return sendError(res, error.message, status);
    }
  }

  static getJwks(req, res) {
    const config = getSsoConfig();
    if (!config.enabled) {
      return sendError(res, 'SSO issuer is not configured', SERVICE_UNAVAILABLE);
    }

    res.set('Cache-Control', 'public, max-age=3600');
    return res.json({ keys: config.jwksKeys });
  }
}

module.exports = SsoController;
