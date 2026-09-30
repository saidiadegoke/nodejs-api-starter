import axios, { AxiosInstance } from 'axios';
import { notConfigured, normalizeUpstreamError } from '../errors';

export const name = 'http';

function getConfig() {
  return {
    baseUrl: (process.env.CRMS_SERVICE_BASE_URL || '').replace(/\/$/, ''),
    apiKey: process.env.CRMS_SERVICE_API_KEY || '',
    timeoutMs: Number(process.env.CRMS_SERVICE_TIMEOUT_MS) || 15000,
  };
}

function client(): AxiosInstance {
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

async function request(method: string, path: string, { params, data, studentContext }: { params?: any; data?: any; studentContext?: any } = {}): Promise<any> {
  try {
    const http = client();
    const config: any = {
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
    if (!res || !res.data) return null;
    return res.data?.data !== undefined ? res.data.data : res.data;
  } catch (err: any) {
    if (err?.details?.error_code === 'provider_not_configured') throw err;
    throw normalizeUpstreamError('crms', err);
  }
}

export async function getCourses(studentContext: any) {
  return request('GET', '/v1/students/me/courses', { studentContext });
}

export async function getResults(studentContext: any) {
  try {
    return await request('GET', '/v1/students/me/results', { studentContext });
  } catch (err: any) {
    if (err?.details?.upstream_status === 404 || err?.statusCode === 404 || err?.status === 404) {
      try {
        return await request('GET', '/api/students/me/results', { studentContext });
      } catch (fallbackErr: any) {
        if (fallbackErr?.details?.upstream_status === 404 || fallbackErr?.statusCode === 404 || fallbackErr?.status === 404) {
          return await request('GET', '/students/me/results', { studentContext });
        }
        throw fallbackErr;
      }
    }
    throw err;
  }
}

export async function getHomeSummary(studentContext: any) {
  return request('GET', '/v1/students/me/home-summary', { studentContext });
}

export async function syncCandidates(payload: any) {
  return request('POST', '/api/candidates/sync', { data: payload });
}

export async function syncInstitutions(payload: any) {
  return request('POST', '/api/institutions/sync', { data: payload });
}

export async function syncSubjects(payload: any) {
  return request('POST', '/api/subjects/sync', { data: payload });
}
