// Mock SMS provider — default for dev/CI. Logs the OTP destination so a
// developer can copy it from the server console; never makes a network
// call. Real providers (SpeedySMS, Termii, Twilio, etc.) live alongside
// this file and are selected via OTP_SMS_PROVIDER.

const name = 'mock';

async function sendSms({ phone, message }) {
  // eslint-disable-next-line no-console
  console.log(`[sms:mock] would deliver to ${phone}: ${message}`);
  return { outcome: 'sent', provider_reference: `mock-${Date.now()}` };
}

module.exports = { name, sendSms };
