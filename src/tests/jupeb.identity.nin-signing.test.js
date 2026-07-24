/**
 * SpeedySMS NIN provider — request signing (SIGNED_REQUESTS_DESIGN.md).
 * We inject a fake `http` and inspect the outbound request.
 */
const crypto = require('crypto');
const provider = require('../modules/jupeb/services/nin-providers/speedysms.provider');

const NIN = '12345678901';
const ORIG = { ...process.env };

function fakeHttp() {
  return {
    calls: [],
    async post(url, body, config) {
      this.calls.push({ url, body, config });
      // Minimal success-ish response so verifyNin doesn't throw.
      return { status: 200, data: { success: true, data: { first_name: 'JANE' } } };
    },
  };
}

afterEach(() => {
  process.env = { ...ORIG };
});

describe('speedysms NIN provider signing', () => {
  beforeEach(() => {
    process.env.SPEEDYSMS_API_KEY = 'sk_live_test';
    delete process.env.SPEEDYSMS_SIGNING_SECRET;
    delete process.env.SPEEDYSMS_API_BASE_URL;
  });

  test('sends NO signature headers when the signing secret is unset', async () => {
    const http = fakeHttp();
    await provider.verifyNin(NIN, { http });
    const { config } = http.calls[0];
    expect(config.headers['X-Signature']).toBeUndefined();
    expect(config.headers.Authorization).toBe('Bearer sk_live_test');
  });

  test('signs the exact body sent, verifiable with the shared secret', async () => {
    const secret = 'whsec_shared';
    process.env.SPEEDYSMS_SIGNING_SECRET = secret;
    const http = fakeHttp();
    await provider.verifyNin(NIN, { http });

    const { body, config } = http.calls[0];
    const h = config.headers;
    expect(h['X-Timestamp']).toMatch(/^\d+$/);
    expect(h['X-Nonce']).toBeTruthy();
    expect(h['X-Signature']).toMatch(/^[a-f0-9]{64}$/);
    // The object body is what axios serializes; sign the same JSON bytes.
    expect(body).toEqual({ nin: NIN });

    // Recompute the signature exactly as the verifier will (over the sent JSON).
    const bodyHash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const canonical = ['POST', '/identity/nin', bodyHash, h['X-Timestamp'], h['X-Nonce']].join('\n');
    const expected = crypto.createHmac('sha256', secret).update(canonical).digest('hex');
    expect(h['X-Signature']).toBe(expected);
  });

  test('uses a fresh nonce per request', async () => {
    process.env.SPEEDYSMS_SIGNING_SECRET = 's';
    const http = fakeHttp();
    await provider.verifyNin(NIN, { http });
    await provider.verifyNin(NIN, { http });
    expect(http.calls[0].config.headers['X-Nonce']).not.toBe(http.calls[1].config.headers['X-Nonce']);
  });
});
