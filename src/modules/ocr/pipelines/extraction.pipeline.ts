import {
  resolveProvider,
  defaultChain,
  fallbackProvider,
} from '../providers';
import {
  ProviderUnavailableError,
  ProviderLowConfidenceError,
  ExtractionInput,
  ExtractionResult,
} from '../providers/base.provider';

export const CONFIDENCE_FLOOR = parseFloat(process.env.OCR_CONFIDENCE_FLOOR || '60');

export interface ExtractionAttempt {
  ok: boolean;
  name: string;
  skipped?: boolean;
  reason?: string;
  error?: any;
  result?: ExtractionResult;
}

export interface ChainResult {
  result: ExtractionResult;
  attempts: ExtractionAttempt[];
}

export async function runChain({
  buffer,
  mimeType,
  filename,
  forcedProvider = null,
}: ExtractionInput & { forcedProvider?: string | null }): Promise<ChainResult> {
  const chain = forcedProvider ? [forcedProvider] : defaultChain();
  const fallback = forcedProvider ? null : fallbackProvider();

  let best: ExtractionResult | null = null;
  const attempts: ExtractionAttempt[] = [];

  for (const name of chain) {
    const outcome = await tryProvider(name, { buffer, mimeType, filename });
    attempts.push(outcome);
    if (!outcome.ok || !outcome.result) continue;

    if (!best || outcome.result.providerConfidence > best.providerConfidence) {
      best = outcome.result;
    }
    if (outcome.result.providerConfidence >= CONFIDENCE_FLOOR) {
      return { result: best, attempts };
    }
  }

  if (fallback) {
    const outcome = await tryProvider(fallback, { buffer, mimeType, filename });
    attempts.push(outcome);
    if (outcome.ok && outcome.result) {
      if (!best || outcome.result.providerConfidence > best.providerConfidence) {
        best = outcome.result;
      }
    }
  }

  if (!best || !best.text || !best.text.trim()) {
    const err: any = new Error('OCR could not extract any usable text');
    err.code = 'OCR_UNREADABLE';
    err.attempts = attempts;
    throw err;
  }

  return { result: best, attempts };
}

async function tryProvider(name: string, input: ExtractionInput): Promise<ExtractionAttempt> {
  let provider;
  try {
    provider = resolveProvider(name);
  } catch (err: any) {
    if (err instanceof ProviderUnavailableError) {
      return { ok: false, name, skipped: true, reason: err.reason };
    }
    throw err;
  }

  if (!provider.supportsMime(input.mimeType)) {
    return { ok: false, name, skipped: true, reason: 'mime not supported' };
  }

  try {
    const result = await provider.extractText(input);
    return {
      ok: true,
      name,
      result: { ...result, providerName: name },
    };
  } catch (err: any) {
    if (
      err instanceof ProviderUnavailableError ||
      err instanceof ProviderLowConfidenceError
    ) {
      return { ok: false, name, skipped: true, reason: err.message };
    }
    return { ok: false, name, skipped: false, error: err };
  }
}
