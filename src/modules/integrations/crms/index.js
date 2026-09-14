// CRMS provider registry.
// Set CRMS_PROVIDER=http (default: http).

const http = require('./http.provider');

const PROVIDERS = {
  [http.name]: http,
};

const DEFAULT_PROVIDER = 'http';

function list() {
  return Object.keys(PROVIDERS);
}

function resolveName() {
  const raw = process.env.CRMS_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

function get(name) {
  const provider = PROVIDERS[name || resolveName()];
  if (!provider) {
    throw new Error(`Unknown CRMS provider: ${name}`);
  }
  return provider;
}

module.exports = { list, get, resolveName, DEFAULT_PROVIDER };
