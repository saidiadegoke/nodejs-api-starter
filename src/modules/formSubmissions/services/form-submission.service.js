const FormSubmissionModel = require('../models/form-submission.model');
const FormResponseModel = require('../models/form-response.model');

async function createSubmission(data, reqMeta = {}) {
  const submission = await FormSubmissionModel.create({
    ...data,
    sourceUrl: reqMeta.sourceUrl,
    ipAddress: reqMeta.ipAddress,
    userAgent: reqMeta.userAgent,
  });
  return submission;
}

async function getById(submissionId, siteId) {
  return FormSubmissionModel.getById(submissionId, siteId);
}

async function listByFormInstance(formInstanceId, siteId, options) {
  return FormSubmissionModel.listByFormInstance(formInstanceId, siteId, options);
}

async function updateStatus(submissionId, siteId, status) {
  if (!FormSubmissionModel.VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status. Must be one of: ${FormSubmissionModel.VALID_STATUSES.join(', ')}`);
  }
  return FormSubmissionModel.updateStatus(submissionId, siteId, status);
}

async function addResponse(submissionId, siteId, { type, body }, userId) {
  if (!FormResponseModel.VALID_TYPES.includes(type)) {
    throw new Error(`Invalid type. Must be one of: ${FormResponseModel.VALID_TYPES.join(', ')}`);
  }
  const submission = await FormSubmissionModel.getById(submissionId, siteId);
  if (!submission) {
    throw new Error('Submission not found');
  }
  const response = await FormResponseModel.create(submissionId, type, body, userId);
  if (type === 'reply') {
    await FormSubmissionModel.updateStatus(submissionId, siteId, 'replied');
  }
  return response;
}

async function getSubmissionWithResponses(submissionId, siteId) {
  const submission = await FormSubmissionModel.getById(submissionId, siteId);
  if (!submission) return null;
  const responses = await FormResponseModel.listBySubmission(submissionId);
  return { ...submission, responses };
}

module.exports = {
  createSubmission,
  getById,
  listByFormInstance,
  updateStatus,
  addResponse,
  getSubmissionWithResponses,
};
