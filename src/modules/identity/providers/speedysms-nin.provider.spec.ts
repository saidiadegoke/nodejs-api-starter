/**
 * SpeedySMS NIN provider (Nest) — request signing conformance.
 *
 * Mocks axios, inspects the outbound headers/body, and pins the signature
 * against the official SpeedySMS "Signed requests" canonical form:
 *   <METHOD>\n<path>\n<sha256(raw body)>\n<X-Timestamp>\n<X-Nonce>
 * with X-Signature = hex HMAC-SHA256 over it.
 *
 * Pure unit test — no DB, no network. Complements
 * src/tests/jupeb.identity.nin-signing.test.js, which covers only the
 * legacy jupeb provider.
 */
import * as crypto from 'crypto';

jest.mock('axios');

import axios from 'axios';
import { Logger } from '@nestjs/common';
import { SpeedySmsNinProvider } from './speedysms-nin.provider';

const mockedPost = axios.post as unknown as jest.Mock;

const NIN = '12345678901';
const SIGNING_VARS = [
  'SPEEDYSMS_API_KEY',
  'JUPEB_SPEEDYSMS_API_KEY',
  'SPEEDYSMS_SIGNING_SECRET',
  'JUPEB_SPEEDYSMS_SIGNING_SECRET',
  'SPEEDYSMS_SIGNING_ENABLED',
  'JUPEB_SPEEDYSMS_SIGNING_ENABLED',
  'SPEEDYSMS_BASE_URL',
  'SPEEDYSMS_API_BASE_URL',
  'JUPEB_SPEEDYSMS_BASE_URL',
];

const ORIG_ENV = { ...process.env };

function successResponse(data: Record<string, any> = {}) {
  return {
    status: 200,
    data: {
      success: true,
      data: { lookup_id: 'lkp_test_1', first_name: 'JANE', ...data },
    },
  };
}

function sentCall() {
  expect(mockedPost).toHaveBeenCalledTimes(1);
  const [url, body, config] = mockedPost.mock.calls[0];
  return { url, body, headers: config.headers as Record<string, string> };
}

/** Recompute the expected signature exactly as the SpeedySMS verifier does. */
function expectedSignature(
  secret: string,
  bodyStr: string,
  ts: string,
  nonce: string,
  path = '/identity/nin',
) {
  const bodyHash = crypto
    .createHash('sha256')
    .update(bodyStr)
    .digest('hex');
  const canonical = ['POST', path, bodyHash, ts, nonce].join('\n');
  return crypto.createHmac('sha256', secret).update(canonical).digest('hex');
}

describe('SpeedySmsNinProvider signing', () => {
  let provider: SpeedySmsNinProvider;

  beforeEach(() => {
    for (const k of SIGNING_VARS) delete process.env[k];
    process.env.SPEEDYSMS_API_KEY = 'sk_live_test';
    mockedPost.mockResolvedValue(successResponse());
    jest
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    provider = new SpeedySmsNinProvider();
  });

  afterEach(() => {
    process.env = { ...ORIG_ENV };
  });

  test('sends no signature headers when the signing secret is unset', async () => {
    const result = await provider.verifyNin(NIN);

    const { url, body, headers } = sentCall();
    expect(url).toBe('https://api.speedysms.com.ng/identity/nin');
    // The exact string sent must be what gets hashed — assert it is a string.
    expect(typeof body).toBe('string');
    expect(body).toBe(JSON.stringify({ nin: NIN }));
    expect(headers.Authorization).toBe('Bearer sk_live_test');
    expect(headers['X-Signature']).toBeUndefined();
    expect(headers['X-Timestamp']).toBeUndefined();
    expect(headers['X-Nonce']).toBeUndefined();
    expect(result.outcome).toBe('verified');
  });

  test('signs the exact body sent, verifiable with the shared secret', async () => {
    const secret = 'whsec_shared';
    process.env.SPEEDYSMS_SIGNING_SECRET = secret;

    await provider.verifyNin(NIN);

    const { body, headers } = sentCall();
    expect(headers['X-Timestamp']).toMatch(/^\d{13,}$/);
    expect(headers['X-Nonce']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    expect(headers['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
    expect(expectedSignature(secret, body, headers['X-Timestamp'], headers['X-Nonce'])).toBe(
      headers['X-Signature'],
    );
  });

  test('sends no signature headers when signing is explicitly disabled', async () => {
    process.env.SPEEDYSMS_SIGNING_SECRET = 'whsec_shared';
    process.env.SPEEDYSMS_SIGNING_ENABLED = 'false';

    const result = await provider.verifyNin(NIN);

    const { headers } = sentCall();
    expect(headers.Authorization).toBe('Bearer sk_live_test');
    expect(headers['X-Signature']).toBeUndefined();
    expect(headers['X-Timestamp']).toBeUndefined();
    expect(headers['X-Nonce']).toBeUndefined();
    expect(result.outcome).toBe('verified');
  });

  test('matches the official spec vector for fixed inputs', async () => {
    const secret = 'whsec_test';
    process.env.SPEEDYSMS_SIGNING_SECRET = secret;
    const ts = 1713090000000;
    const nonce = '00000000-0000-4000-a000-000000000000';
    jest.spyOn(Date, 'now').mockReturnValue(ts);
    jest.spyOn(crypto, 'randomUUID').mockReturnValue(nonce);

    await provider.verifyNin(NIN);

    const { body, headers } = sentCall();
    const bodyStr = '{"nin":"12345678901"}';
    expect(body).toBe(bodyStr);
    expect(headers['X-Timestamp']).toBe(String(ts));
    expect(headers['X-Nonce']).toBe(nonce);
    expect(headers['X-Signature']).toBe(
      expectedSignature(secret, bodyStr, String(ts), nonce),
    );
  });

  test('hashes the exact bytes sent including provider and force_fresh overrides', async () => {
    const secret = 'whsec_shared';
    process.env.SPEEDYSMS_SIGNING_SECRET = secret;

    await provider.verifyNin(NIN, { provider: 'mock', force_fresh: true });

    const { body, headers } = sentCall();
    expect(body).toBe(
      JSON.stringify({ nin: NIN, provider: 'mock', force_fresh: true }),
    );
    expect(expectedSignature(secret, body, headers['X-Timestamp'], headers['X-Nonce'])).toBe(
      headers['X-Signature'],
    );
  });

  test('uses a fresh nonce per request', async () => {
    process.env.SPEEDYSMS_SIGNING_SECRET = 's';
    mockedPost.mockResolvedValue(successResponse());

    await provider.verifyNin(NIN);
    await provider.verifyNin(NIN);

    const [first, second] = mockedPost.mock.calls;
    expect(first[2].headers['X-Nonce']).not.toBe(
      second[2].headers['X-Nonce'],
    );
  });
});
