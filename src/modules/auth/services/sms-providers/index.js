// SMS provider registry. To add a provider:
//   1. Create ./<name>.provider.js exporting { name, sendSms({phone, message}) }.
//   2. Register the module here.
//   3. Set OTP_SMS_PROVIDER=<name> in env (+ any provider-specific secrets).

const mock = require('./mock.provider');
const speedysms = require('./speedysms.provider');

const PROVIDERS = {
  [mock.name]: mock,
  [speedysms.name]: speedysms,
};

const DEFAULT_PROVIDER = 'mock';

function resolveName() {
  const raw = process.env.OTP_SMS_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

function get(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown SMS provider: ${name}`);
  return provider;
}

function list() {
  return Object.keys(PROVIDERS);
}

module.exports = { list, get, resolveName, DEFAULT_PROVIDER };
