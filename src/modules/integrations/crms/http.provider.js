const axios = require('axios');
const { notConfigured, normalizeUpstreamError } = require('../errors');

const name = 'http';

function getConfig() {
  return {
    baseUrl: (process.env.CRMS_SERVICE_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.CRMS_SERVICE_API_KEY || '',
    timeoutMs: Number(process.env.CRMS_SERVICE_TIMEOUT_MS) || 15000,
  };
}

function client() {
  const { baseUrl, apiKey, timeoutMs } = getConfig();
  if (!baseUrl || !apiKey) {
    throw notConfigured('crms');
  }
  return axios.create({
    baseURL: baseUrl,
    timeout: timeoutMs,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'x-api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

async function request(method, path, { params, data, studentContext } = {}) {
  try {
    const http = client();
    const config = {
      method,
      url: path,
      data,
    };
    if (studentContext) {
      config.params = {
        ...params,
        student_id: studentContext.user_id,
        registration_id: studentContext.registration_id,
        candidate_code: studentContext.candidate_code,
      };
    } else if (params) {
      config.params = params;
    }
    const res = await http.request(config);
    return res.data?.data !== undefined ? res.data.data : res.data;
  } catch (err) {
    if (err.details?.error_code === 'provider_not_configured') throw err;
    throw normalizeUpstreamError('crms', err);
  }
}

async function getCourses(studentContext) {
  return request('GET', '/v1/students/me/courses', { studentContext });
}

async function getResults(studentContext) {
  return request('GET', '/v1/students/me/results', { studentContext });
}

async function getHomeSummary(studentContext) {
  return request('GET', '/v1/students/me/home-summary', { studentContext });
}

async function syncCandidates(payload) {
  return request('POST', '/api/candidates/sync', { data: payload });
}

async function syncInstitutions(payload) {
  return request('POST', '/api/institutions/sync', { data: payload });
}

module.exports = {
  name,
  getCourses,
  getResults,
  getHomeSummary,
  syncCandidates,
  syncInstitutions,
};
