export interface SmsPayload {
  phone: string;
  message: string;
}

export interface SmsResult {
  outcome: 'sent' | 'failed';
  provider_reference?: string | null;
  error_code?: string;
  error_message?: string;
}

export interface SmsProvider {
  name: string;
  sendSms(payload: SmsPayload): Promise<SmsResult>;
}

export const mockProvider: SmsProvider = {
  name: 'mock',
  async sendSms({ phone, message }: SmsPayload): Promise<SmsResult> {
    // eslint-disable-next-line no-console
    console.log(`[sms:mock] would deliver to ${phone}: ${message}`);
    return { outcome: 'sent', provider_reference: `mock-${Date.now()}` };
  },
};
