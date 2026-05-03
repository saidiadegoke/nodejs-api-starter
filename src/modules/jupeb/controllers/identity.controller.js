const identityService = require('../services/identity.service');
const { sendSuccess, sendError } = require('../../../shared/utils/response');
const { INTERNAL_SERVER_ERROR, CONFLICT } = require('../../../shared/constants/statusCodes');

class IdentityController {
  static async verifyNin(req, res) {
    try {
      const data = await identityService.verifyNin(
        {
          nin: req.body.nin,
          idempotency_key: req.body.idempotency_key,
          intake_payload: req.body.intake_payload,
        },
        req.user.user_id
      );
      let message = 'NIN verified';
      if (data.status === 'failed') message = 'NIN verification failed';
      else if (data.status === 'pending') message = 'NIN verification pending — provider unavailable';
      return sendSuccess(res, data, message, 200);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async retryVerification(req, res) {
    try {
      const data = await identityService.retryVerification(
        req.params.verificationId,
        req.user.user_id
      );
      let message = 'NIN verified';
      if (data.status === 'failed') message = 'NIN verification failed';
      else if (data.status === 'pending') message = 'NIN verification still pending';
      return sendSuccess(res, data, message, 200);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getVerification(req, res) {
    try {
      const data = await identityService.getVerification(req.params.verificationId, req.user.user_id);
      return sendSuccess(res, data, 'Verification retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async createBiometric(req, res) {
    try {
      const row = await identityService.createBiometric(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Biometric capture created', 201);
    } catch (err) {
      if (err.status === CONFLICT) return sendError(res, err.message, CONFLICT);
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async skipBiometric(req, res) {
    try {
      const data = await identityService.skipBiometric(
        req.params.registrationId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Biometric capture skipped');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async listBiometrics(req, res) {
    try {
      const rows = await identityService.listBiometrics(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, rows, 'Biometric captures retrieved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getRegistrationPhoto(req, res) {
    try {
      const data = await identityService.getRegistrationPhoto(
        req.params.registrationId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Registration photo URL');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async replaceBiometric(req, res) {
    try {
      const data = await identityService.replaceBiometric(
        req.params.captureId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Biometric capture replaced');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async deleteBiometric(req, res) {
    try {
      const row = await identityService.deleteBiometric(req.params.captureId, req.user.user_id);
      return sendSuccess(res, row, 'Biometric capture deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = IdentityController;
