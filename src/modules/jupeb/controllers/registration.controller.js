const registrationService = require('../services/registration.service');
const bulkRegistrationService = require('../services/bulk-registration.service');
const { sendSuccess, sendError, sendPaginated } = require('../../../shared/utils/response');
const { CREATED, INTERNAL_SERVER_ERROR } = require('../../../shared/constants/statusCodes');

class RegistrationController {
  static async institutionBulkUpload(req, res) {
    try {
      const buffer = req.uploadedFileBuffer;
      if (!buffer) {
        return sendError(res, 'No spreadsheet file provided. Upload a .csv or .xlsx file.', 422);
      }
      const session_id = req.body.session_id || req.query.session_id;
      const university_id = req.body.university_id || req.query.university_id;
      const provider = req.body.provider || req.query.provider;

      const result = await bulkRegistrationService.process({
        buffer,
        session_id,
        university_id,
        userId: req.user.user_id,
        provider,
      });

      if (result.succeeded_count > 0 && (result.failed_count > 0 || result.skipped_count > 0)) {
        return sendSuccess(res, result, 'Bulk upload completed with partial success', 207);
      }
      if (result.succeeded_count > 0) {
        return sendSuccess(res, result, 'Bulk upload completed successfully', 200);
      }
      let failureMessage = 'All rows in bulk upload failed or were skipped';
      const duplicateFailures = (result.failed || []).filter(
        (f) => f.error_code === 'already_registered' || f.error_code === 'duplicate_in_file'
      );
      if (duplicateFailures.length > 0 && duplicateFailures.length === result.failed_count && (result.skipped_count === 0 || !result.skipped_count)) {
        failureMessage = 'Bulk upload failed: All candidates have duplicate or already registered NINs';
      } else if (duplicateFailures.length > 0) {
        failureMessage = `Bulk upload failed: Duplicate or already registered NINs detected (${duplicateFailures.length} candidate${duplicateFailures.length > 1 ? 's' : ''})`;
      }
      return res.status(422).json({
        success: false,
        message: failureMessage,
        data: result,
      });
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionCreate(req, res) {
    try {
      const row = await registrationService.institutionCreate(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Registration created', CREATED);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionPatch(req, res) {
    try {
      const row = await registrationService.institutionPatch(
        req.params.registrationId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, row, 'Registration updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionPatchCandidate(req, res) {
    try {
      const data = await registrationService.institutionPatchCandidate(
        req.params.registrationId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Candidate updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionResendCode(req, res) {
    try {
      const data = await registrationService.institutionResendCode(
        req.params.registrationId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Registration code email queued');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /** Hard-delete a registration row (guarded: rejected, withdrawn, or unclaimed code). */
  static async institutionDelete(req, res) {
    try {
      const data = await registrationService.institutionDeleteRegistration(
        req.params.registrationId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Registration deleted');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // E.4 — overview KPI cards
  static async institutionStats(req, res) {
    try {
      const data = await registrationService.institutionStats(req.query, req.user.user_id);
      return sendSuccess(res, data);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  // E.5 — top-N institutions bar chart
  static async institutionByUniversity(req, res) {
    try {
      const data = await registrationService.institutionByUniversity(req.query, req.user.user_id);
      return sendSuccess(res, data);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // E.6 — CSV export honoring the same filters as institutionList
  static async institutionExportCsv(req, res) {
    try {
      const data = await registrationService.institutionExportCsv(req.query, req.user.user_id);
      const filename = `candidates-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).end(data);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async institutionList(req, res) {
    try {
      const { rows, page, limit, total } = await registrationService.institutionList(req.query, req.user.user_id);
      return sendPaginated(res, rows, page, limit, total);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  // Single-call candidate detail — composes registration, candidate user,
  // displays, NIN verification, documents, result entries, biometrics,
  // NoK, and status history. Powers the institution dashboard's
  // candidate detail page.
  static async institutionGetCandidate(req, res) {
    try {
      const data = await registrationService.institutionGetCandidate(
        req.params.registrationId,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Candidate detail');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionApprove(req, res) {
    try {
      const row = await registrationService.institutionApprove(req.params.registrationId, req.user.user_id);
      return sendSuccess(res, row, 'Registration approved');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  // E.7 — batch approve / reject / withdraw / delete
  static async institutionBatchAction(req, res) {
    try {
      const data = await registrationService.institutionBatchAction(req.body, req.user.user_id);
      const { action, total, accepted_count, rejected_count } = data;
      const verb = action === 'delete' ? 'deleted' : `${action}d`;
      const message = `${accepted_count} of ${total} registration${total === 1 ? '' : 's'} ${verb}`;
      if (accepted_count === 0 && rejected_count > 0) {
        return sendError(res, message, 422, data);
      }
      return sendSuccess(res, data, message);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  // E.8 — per-row withdraw
  static async institutionWithdraw(req, res) {
    try {
      const data = await registrationService.institutionWithdraw(
        req.params.registrationId,
        req.body,
        req.user.user_id
      );
      return sendSuccess(res, data, 'Registration withdrawn');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async institutionReject(req, res) {
    try {
      const row = await registrationService.institutionReject(req.params.registrationId, req.body, req.user.user_id);
      return sendSuccess(res, row, 'Registration rejected');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getCodeStatus(req, res) {
    try {
      const data = await registrationService.getCodeStatus(req.query.code);
      return sendSuccess(res, data, 'Code status');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async claimCode(req, res) {
    try {
      const row = await registrationService.claimCode(req.body, req.user.user_id);
      return sendSuccess(res, row, 'Code claimed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async getMeCurrent(req, res) {
    try {
      const data = await registrationService.getMeCurrent(req.user.user_id);
      return sendSuccess(res, data, 'Current registration');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getMeProfile(req, res) {
    try {
      const data = await registrationService.getMeProfile(req.user.user_id);
      return sendSuccess(res, data, 'Candidate profile');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async updateAcademicIntake(req, res) {
    try {
      const data = await registrationService.updateAcademicIntake(req.user.user_id, req.body);
      return sendSuccess(res, data, 'Academic intake updated');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async patchMeProfile(req, res) {
    try {
      const data = await registrationService.updateMeProfile(req.user.user_id, req.body);
      return sendSuccess(res, data, 'Profile updated');
    } catch (err) {
      const details = err.details || null;
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, details);
    }
  }

  /**
   * M.10 — Stream the candidate's registration form as a PDF.
   * Allowed only when the registration is at `pending_institution_review`
   * or later, since earlier states are still being filled in.
   */
  static async getMeRegistrationFormPdf(req, res) {
    try {
      const userId = req.user.user_id;
      const { registration, preview } =
        await registrationService.getMeRegistrationFormPayload(userId);

      const READY = new Set(['pending_institution_review', 'approved']);
      if (!READY.has(registration.status)) {
        return sendError(
          res,
          'Registration is not ready for export. Submit your registration first.',
          422,
          { error_code: 'not_ready', current_status: registration.status }
        );
      }

      // Lazy require so that pdfkit being missing surfaces as a runtime 500
      // rather than crashing the whole module at startup.
      // eslint-disable-next-line global-require
      const RegistrationFormPdfService = require('../services/registration-form-pdf.service');
      const buffer = await RegistrationFormPdfService.render(preview);

      const filename = `registration-form-${registration.provisional_candidate_code || registration.id}.pdf`;
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      return res.status(200).end(buffer);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getMeSubmissionPreview(req, res) {
    try {
      const data = await registrationService.getMeSubmissionPreview(req.user.user_id);
      return sendSuccess(res, data, 'Submission preview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async confirmSubjects(req, res) {
    try {
      const row = await registrationService.confirmSubjects(req.user.user_id, req.body);
      return sendSuccess(res, row, 'Subjects confirmed');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async submit(req, res) {
    try {
      const { row, message } = await registrationService.submitForReview(req.user.user_id);
      return sendSuccess(res, row, message);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async dashboardAccess(req, res) {
    try {
      const data = await registrationService.getDashboardAccess(req.user.user_id);
      return sendSuccess(res, data, 'Dashboard access');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }

  static async getMeExamResults(req, res) {
    try {
      const data = await registrationService.getMeExamResults(req.user.user_id, {
        source: req.query.source,
        sitting: req.query.sitting,
      });
      return sendSuccess(res, data, 'Exam results');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async getMeSlip(req, res) {
    try {
      const data = await registrationService.getMeSlip(req.user.user_id);
      return sendSuccess(res, data, 'Registration slip');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  /**
   * Public (token-authenticated) PDF download for the registration slip.
   * No Bearer auth — the signed query token is the credential.
   */
  static async downloadMeSlip(req, res) {
    try {
      const { buffer, filename } = await registrationService.downloadMeSlipByToken(
        req.query.token
      );
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      res.setHeader('Content-Length', String(buffer.length));
      return res.status(200).end(buffer);
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR, err.details || null);
    }
  }

  static async numberingPreview(req, res) {
    try {
      const data = await registrationService.numberingPreview(req.params.sessionId, req.user.user_id);
      return sendSuccess(res, data, 'Numbering preview');
    } catch (err) {
      return sendError(res, err.message, err.status || INTERNAL_SERVER_ERROR);
    }
  }
}

module.exports = RegistrationController;
