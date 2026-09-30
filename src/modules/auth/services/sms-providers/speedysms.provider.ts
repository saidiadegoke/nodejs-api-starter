import axios from 'axios';
import { SmsPayload, SmsResult, SmsProvider } from './mock.provider';

const DEFAULT_BASE_URL = 'https://api.speedysms.com.ng';
const DEFAULT_TIMEOUT_MS = 15_000;

function config() {
  return {
    apiKey: process.env.SPEEDYSMS_API_KEY || '',
    baseUrl: (process.env.SPEEDYSMS_API_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, ''),
    timeoutMs: Number(process.env.SPEEDYSMS_SMS_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
    senderId: (process.env.SPEEDYSMS_SENDER_ID || 'OTP').slice(0, 11),
  };
}

export const speedysmsProvider: SmsProvider = {
  name: 'speedysms',
  async sendSms({ phone, message }: SmsPayload): Promise<SmsResult> {
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
      const r = await axios.post(
        `${baseUrl}/sms/send`,
        { to: phone, message, sender_id: senderId },
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
            accept: 'application/json',
          },
          timeout: timeoutMs,
          validateStatus: (s: number) => s < 500,
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
    } catch (err: any) {
      return {
        outcome: 'failed',
        error_code: err.code || 'provider_unavailable',
        error_message: err.message || 'SpeedySMS request failed',
      };
    }
  },
};
