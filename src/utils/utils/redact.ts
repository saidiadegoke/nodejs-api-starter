/**
 * Redaction of credential-bearing fields before anything is persisted.
 *
 * Shared by `RequestLogMiddleware` (which stores request bodies on error/slow responses)
 * and the audit writer (whose `details` frequently carry the same bodies).
 */

const SENSITIVE_KEY_PATTERN = /password|passwd|secret|token|authorization|api[_-]?key|credential|national[_-]?id/i;
const SENSITIVE_EXACT_KEYS = ['pin', 'otp', 'cvv', 'nin', 'bvn'];

const REDACTED = '[REDACTED]';
const MAX_DEPTH = 5;

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_PATTERN.test(lower) || SENSITIVE_EXACT_KEYS.includes(lower);
}

/**
 * Deep-clone `value`, replacing the value of any sensitive-looking key with `[REDACTED]`.
 * Returns the input unchanged for primitives and for non-plain objects (Date, Buffer, ...)
 * so callers can pass anything they would otherwise have serialised.
 */
export function redactSensitive<T>(value: T, depth = 0): T {
  if (value === null || typeof value !== 'object' || depth >= MAX_DEPTH) return value;
  if (value instanceof Date || Buffer.isBuffer(value)) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1)) as unknown as T;
  }

  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value as Record<string, any>)) {
    out[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(item, depth + 1);
  }
  return out as T;
}

/**
 * Convenience wrapper for the common "serialise a request body" case: returns `null` for
 * an empty body so callers persist NULL rather than `{}`.
 */
export function redactBody(body: any): Record<string, any> | null {
  if (!body || typeof body !== 'object' || Object.keys(body).length === 0) return null;
  const redacted = redactSensitive(body);
  return Object.keys(redacted).length > 0 ? redacted : null;
}
