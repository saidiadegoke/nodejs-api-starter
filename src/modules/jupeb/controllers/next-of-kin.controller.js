const nextOfKinService = require('../services/next-of-kin.service');
const { sendSuccess, sendError } = require('../../../utils/utils/response');

function handle(res, fn) {
  return Promise.resolve()
    .then(fn)
    .catch((err) => {
      const status = err.status || 500;
      sendError(res, err.message || 'Server error', status, err.details || null);
    });
}

class NextOfKinController {
  static getMe(req, res) {
    return handle(res, async () => {
      const data = await nextOfKinService.getMine(req.user.user_id);
      sendSuccess(res, data);
    });
  }

  static createMe(req, res) {
    return handle(res, async () => {
      const data = await nextOfKinService.createMine(req.user.user_id, req.body);
      sendSuccess(res, data, 'Next-of-kin recorded', 201);
    });
  }

  static replaceMe(req, res) {
    return handle(res, async () => {
      const data = await nextOfKinService.replaceMine(req.user.user_id, req.body);
      sendSuccess(res, data, 'Next-of-kin updated');
    });
  }

  static listHistory(req, res) {
    return handle(res, async () => {
      const data = await nextOfKinService.listHistoryMine(req.user.user_id);
      sendSuccess(res, data);
    });
  }
}

module.exports = NextOfKinController;
