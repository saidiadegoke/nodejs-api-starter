// Attendance provider registry.
// Set ATTENDANCE_PROVIDER=mock|http (default: http).

const mock = require('./mock.provider');
const http = require('./http.provider');

const PROVIDERS = {
  [mock.name]: mock,
  [http.name]: http,
};

const DEFAULT_PROVIDER = 'http';

function list() {
  return Object.keys(PROVIDERS);
}

function resolveName() {
  const raw = process.env.ATTENDANCE_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

function get(name) {
  const provider = PROVIDERS[name || resolveName()];
  if (!provider) {
    throw new Error(`Unknown attendance provider: ${name}`);
  }
  return provider;
}

module.exports = { list, get, resolveName, DEFAULT_PROVIDER };
