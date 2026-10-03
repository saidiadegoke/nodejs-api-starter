// NIN provider registry. To add a provider:
//   1. Create ./<name>.provider.js exporting { name, verifyNin(normalizedNin) }.
//   2. Register the module here.
//   3. Set JUPEB_NIN_PROVIDER=<name> in env (+ any provider-specific secrets).

const mock = require('./mock.provider');
const speedysms = require('./speedysms.provider');

const PROVIDERS = {
  [mock.name]: mock,
  [speedysms.name]: speedysms,
};

const DEFAULT_PROVIDER = 'speedysms';

function list() {
  return Object.keys(PROVIDERS);
}

function resolveName() {
  const raw = process.env.JUPEB_NIN_PROVIDER || process.env.NIN_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

function get(name) {
  const provider = PROVIDERS[name];
  if (!provider) {
    throw new Error(`Unknown NIN provider: ${name}`);
  }
  return provider;
}

module.exports = { list, get, resolveName, DEFAULT_PROVIDER };
