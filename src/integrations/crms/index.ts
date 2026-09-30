import * as http from './http.provider';

const PROVIDERS: Record<string, typeof http> = {
  [http.name]: http,
};

const DEFAULT_PROVIDER = 'http';

export function list(): string[] {
  return Object.keys(PROVIDERS);
}

export function resolveName(): string {
  const raw = process.env.CRMS_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

export function get(name?: string): typeof http {
  const providerName = name || resolveName();
  const provider = PROVIDERS[providerName];
  if (!provider) {
    throw new Error(`Unknown crms provider: ${name}`);
  }
  return provider;
}

export { http, DEFAULT_PROVIDER };
