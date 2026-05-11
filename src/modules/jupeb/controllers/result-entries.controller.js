const resultEntriesService = require('../services/result-entries.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');

function handle(res, fn) {
  return Promise.resolve()
    .then(fn)
    .catch((err) => {
      const status = err.status || 500;
      sendError(res, err.message || 'Server error', status, err.details || null);
    });
}

class ResultEntriesController {
  static listMine(req, res) {
    return handle(res, async () => {
      const data = await resultEntriesService.listMine(req.user.user_id);
      sendSuccess(res, data);
    });
  }

  static upsertMine(req, res) {
    return handle(res, async () => {
      const data = await resultEntriesService.upsertMine(req.user.user_id, req.body);
      sendSuccess(res, data, 'Result entries saved', 200);
    });
  }

  static listForInstitution(req, res) {
    return handle(res, async () => {
      const data = await resultEntriesService.listForInstitution(
        req.user.user_id,
        req.params.registrationId
      );
      sendSuccess(res, data);
    });
  }

  static patchInstitutionEntry(req, res) {
    return handle(res, async () => {
      const data = await resultEntriesService.patchInstitutionEntry(
        req.user.user_id,
        req.params.entryId,
        req.body
      );
      sendSuccess(res, data, 'Entry updated');
    });
  }
}

module.exports = ResultEntriesController;
