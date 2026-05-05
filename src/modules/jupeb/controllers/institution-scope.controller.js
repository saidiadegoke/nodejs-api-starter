const institutionUserScopeService = require('../services/institution-user-scope.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { OK, INTERNAL_SERVER_ERROR, UNPROCESSABLE_ENTITY } = require('../../../shared/constants/statusCodes');

class InstitutionScopeController {
  /** PATCH body: { jupeb_university_id: uuid | null } */
  static async patchUserJupebUniversity(req, res) {
    try {
      const { userId } = req.params;
      const body = req.body || {};
      if (!('jupeb_university_id' in body)) {
        return sendError(res, 'jupeb_university_id is required (use null to clear)', UNPROCESSABLE_ENTITY);
      }
      const row = await institutionUserScopeService.setProfileJupebUniversityId(userId, body.jupeb_university_id);
      return sendSuccess(res, row, 'JUPEB institution scope updated', OK);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = InstitutionScopeController;
