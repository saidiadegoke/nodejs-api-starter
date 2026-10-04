import { Injectable } from '@nestjs/common';
import axios from 'axios';
import * as crypto from 'crypto';
import { INinProvider, NinVerificationResult } from './nin-provider.interface';

const DEFAULT_BASE_URL = 'https://api.speedysms.com.ng';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_RETRY_SECONDS = 300;

function joinNonEmpty(parts: (string | null | undefined)[], sep: string): string | null {
  return parts.filter((p): p is string => typeof p === 'string' && p.trim() !== '').join(sep) || null;
}

/**
 * Request signing (SpeedySMS "signed requests" — docs/SIGNED_REQUESTS_DESIGN.md).
 * Returns {} when SPEEDYSMS_SIGNING_SECRET is unset,
 * else X-Timestamp / X-Nonce / X-Signature over a canonical string binding
 * method + path + body + time + a single-use nonce.
 */
function signedHeaders(
  method: string,
  path: string,
  bodyStr: string,
  secret?: string,
): Record<string, string> {
  const s = String(secret || '').replace(/^["']|["']$/g, '').trim();
  if (!s) return {};
  const ts = Date.now().toString();
  const nonce = crypto.randomUUID();
  const bodyHash = crypto.createHash('sha256').update(bodyStr).digest('hex');
  const canonical = [method.toUpperCase(), path, bodyHash, ts, nonce].join('\n');
  const signature = crypto.createHmac('sha256', s).update(canonical).digest('hex');
  return {
    'X-Timestamp': ts,
    'X-Nonce': nonce,
    'X-Signature': signature,
  };
}

function mapProfile(lookupResult: any) {
  const env = lookupResult && typeof lookupResult === 'object' ? lookupResult : {};
  const data = env.data && typeof env.data === 'object' ? env.data : {};
  const birthplace = data.birthplace || {};
  const residence = data.residence || {};
  const nok = data.next_of_kin || {};
  const nokName = joinNonEmpty([nok.first_name, nok.middle_name, nok.last_name], ' ');
  return {
    first_name: data.first_name ?? null,
    last_name: data.last_name ?? null,
    middle_name: data.middle_name ?? null,
    title: data.title ?? null,
    date_of_birth: data.date_of_birth ?? null,
    gender: data.gender ?? null,
    height: data.height ?? null,
    marital_status: data.marital_status ?? null,
    religion: data.religion ?? null,
    profession: data.profession ?? null,
    education_level: data.education_level ?? null,
    employment_status: data.employment_status ?? null,
    spoken_language: data.spoken_language ?? null,
    email: data.email ?? null,
    phone_number: data.phone_number ?? null,
    phone: data.phone_number ?? null,
    address: joinNonEmpty(
      [residence.address, residence.town, residence.lga, residence.state],
      ', ',
    ),
    state_of_origin: birthplace.state ?? null,
    lga: birthplace.lga ?? null,
    place_of_birth: joinNonEmpty(
      [birthplace.lga, birthplace.state, birthplace.country],
      ', ',
    ),
    birthplace: Object.keys(birthplace).length ? birthplace : null,
    residence: Object.keys(residence).length ? residence : null,
    next_of_kin: {
      name: nokName || null,
      relationship: nok.relationship ?? null,
      contact: nok.phone ?? nok.contact ?? nok.contact_no ?? null,
    },
    next_of_kin_record: Object.keys(nok).length ? nok : null,
    tracking_id: data.tracking_id ?? null,
    photo_url: env.photo_url ?? null,
    signature_url: env.signature_url ?? null,
    provider_lookup: {
      lookup_id: env.lookup_id ?? null,
      nin_last_4: env.nin_last_4 ?? null,
      from_cache: env.from_cache ?? null,
      cached_at: env.cached_at ?? null,
      original_lookup_id: env.original_lookup_id ?? null,
      billed: env.billed ?? null,
      error_message: env.error_message ?? null,
    },
  };
}

function isBalanceOrPoolExhaustedMessage(message?: string): boolean {
  const m = String(message || '').toLowerCase();
  return /insufficient\s+wallet|wallet\s+balance|balance\s+to\s+process|identity\s*balance|top\s*up|billing|pool/i.test(
    m,
  );
}

@Injectable()
export class SpeedySmsNinProvider implements INinProvider {
  readonly name = 'speedysms';

  private get apiKey(): string {
    return (
      process.env.SPEEDYSMS_API_KEY ||
      process.env.JUPEB_SPEEDYSMS_API_KEY ||
      ''
    ).replace(/^["']|["']$/g, '').trim();
  }

  private get signingSecret(): string {
    return (
      process.env.SPEEDYSMS_SIGNING_SECRET ||
      process.env.JUPEB_SPEEDYSMS_SIGNING_SECRET ||
      ''
    ).replace(/^["']|["']$/g, '').trim();
  }

  private get baseUrl(): string {
    return (
      process.env.SPEEDYSMS_BASE_URL ||
      process.env.SPEEDYSMS_API_BASE_URL ||
      process.env.JUPEB_SPEEDYSMS_BASE_URL ||
      DEFAULT_BASE_URL
    ).replace(/\/+$/, '');
  }

  private get timeoutMs(): number {
    const raw =
      process.env.SPEEDYSMS_TIMEOUT_MS ||
      process.env.SPEEDYSMS_NIN_TIMEOUT_MS ||
      process.env.JUPEB_SPEEDYSMS_TIMEOUT_MS;
    const n = parseInt(String(raw), 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
  }

  async verifyNin(
    normalizedNin: string,
    options: { provider?: string; force_fresh?: boolean } = {},
  ): Promise<NinVerificationResult> {
    if (!this.apiKey) {
      return {
        outcome: 'pending',
        error: {
          code: 'provider_unconfigured',
          message: 'SpeedySMS API key is not configured',
        },
        retry_after: new Date(Date.now() + DEFAULT_RETRY_SECONDS * 1000),
      };
    }

    const payload: Record<string, any> = {
      nin: normalizedNin,
    };
    if (options.provider) payload.provider = String(options.provider);
    if (options.force_fresh) payload.force_fresh = true;

    const url = `${this.baseUrl}/identity/nin`;
    const bodyStr = JSON.stringify(payload);
    let path = '/identity/nin';
    try {
      path = new URL(url).pathname;
    } catch {
      // keep default path
    }

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...signedHeaders('POST', path, bodyStr, this.signingSecret),
    };

    try {
      const response = await axios.post(url, bodyStr, {
        headers,
        timeout: this.timeoutMs,
      });

      console.log('response', response);
      console.info('response', response);

      const body = response.data;
      const data = body?.data ?? body;

      if (data?.status === 'failed' || body?.success === false) {
        const error = data?.error || {};
        const msg = error.message || error.error_message || body?.message || 'Verification failed';
        if (isBalanceOrPoolExhaustedMessage(msg)) {
          return {
            outcome: 'pending',
            error: { code: 'provider_unavailable', message: msg },
            retry_after: new Date(Date.now() + DEFAULT_RETRY_SECONDS * 1000),
          };
        }
        return {
          outcome: 'failed',
          error: { code: error.code || 'nin_not_found', message: msg },
        };
      }

      return {
        outcome: 'verified',
        provider_reference: data?.lookup_id || data?.tracking_id || `spd-${normalizedNin.slice(-4)}`,
        profile: mapProfile(data),
      };
    } catch (err: any) {
      const status = err.response?.status;
      const data = err.response?.data;
      const msg = data?.message || data?.error?.message || err.message;

      if (status >= 400 && status < 500 && status !== 429) {
        return {
          outcome: 'failed',
          error: { code: 'upstream_client_error', message: msg },
        };
      }

      return {
        outcome: 'pending',
        error: { code: 'upstream_server_error', message: msg },
        retry_after: new Date(Date.now() + DEFAULT_RETRY_SECONDS * 1000),
      };
    }
  }
}
