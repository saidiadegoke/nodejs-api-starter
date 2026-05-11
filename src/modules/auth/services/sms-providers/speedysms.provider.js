const axios = require('axios');

// SpeedySMS SMS provider. Uses the same SPEEDYSMS_API_KEY /
// SPEEDYSMS_API_BASE_URL the Identity (NIN) provider uses, so a single
// SpeedySMS account drives both flows.
//
// Endpoint shape (see speedysms.com.ng API docs):
//   POST {baseUrl}/sms/send
//   Headers: Authorization: Bearer <api_key>
//   Body:    { "to": "<E.164>", "message": "<text>", "sender_id": "<11 chars max>" }
//
// Returns { outcome: 'sent' | 'failed', provider_reference, error_message }
// — never throws; failures become outcome: 'failed' so the OTP service
// can record the row and let the caller decide whether to retry.

const DEFAULT_BASE_URL = 'https://api.speedysms.com.ng';
const DEFAULT_TIMEOUT_MS = 15_000;

const name = 'speedysms';

function config() {
  return {
    apiKey: process.env.SPEEDYSMS_API_KEY || '',
    baseUrl: (process.env.SPEEDYSMS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    timeoutMs: Number(process.env.SPEEDYSMS_SMS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    senderId: (process.env.SPEEDYSMS_SENDER_ID || 'OTP').slice(0, 11),
  };
}

async function sendSms({ phone, message }, { http = axios } = {}) {
  const { apiKey, baseUrl, timeoutMs, senderId } = config();
  if (!apiKey) {
    return {
      outcome: 'failed',
      error_code: 'provider_misconfigured',
      error_message: 'SPEEDYSMS_API_KEY is not set',
    };
  }
  if (!phone) {
    return {
      outcome: 'failed',
      error_code: 'phone_required',
      error_message: 'No destination phone number',
    };
  }
  try {
    const r = await http.post(
      `${baseUrl}/sms/send`,
      { to: phone, message, sender_id: senderId },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          accept: 'application/json',
        },
        timeout: timeoutMs,
        validateStatus: (s) => s < 500,
      }
    );
    const body = r.data || {};
    if (r.status >= 200 && r.status < 300 && (body.status || '').toLowerCase() === 'success') {
      return {
        outcome: 'sent',
        provider_reference: body.message_id || body.reference || null,
      };
    }
    return {
      outcome: 'failed',
      error_code: body.error_code || `http_${r.status}`,
      error_message: body.message || body.error_message || `SpeedySMS returned ${r.status}`,
    };
  } catch (err) {
    return {
      outcome: 'failed',
      error_code: err.code || 'provider_unavailable',
      error_message: err.message || 'SpeedySMS request failed',
    };
  }
}

module.exports = { name, sendSms };
