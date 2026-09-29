import { SmsProvider } from './mock.provider';
import { mockProvider } from './mock.provider';
import { speedysmsProvider } from './speedysms.provider';

export * from './mock.provider';
export * from './speedysms.provider';

const PROVIDERS: Record<string, SmsProvider> = {
  [mockProvider.name]: mockProvider,
  [speedysmsProvider.name]: speedysmsProvider,
};

export const DEFAULT_PROVIDER = 'mock';

export function resolveName(): string {
  const raw = process.env.OTP_SMS_PROVIDER;
  const name = (raw || DEFAULT_PROVIDER).toLowerCase();
  return PROVIDERS[name] ? name : DEFAULT_PROVIDER;
}

export function getProvider(name: string): SmsProvider {
  const provider = PROVIDERS[name];
  if (!provider) throw new Error(`Unknown SMS provider: ${name}`);
  return provider;
}

export function listProviders(): string[] {
  return Object.keys(PROVIDERS);
}
