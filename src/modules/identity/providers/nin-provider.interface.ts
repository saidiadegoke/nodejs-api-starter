export interface NinVerificationResult {
  outcome: 'verified' | 'failed' | 'pending';
  profile?: Record<string, any>;
  provider_reference?: string;
  error?: {
    code?: string;
    message?: string;
    error_message?: string;
  };
  retry_after?: Date | string | null;
  raw_response?: any;
}

export interface INinProvider {
  name: string;
  verifyNin(
    normalizedNin: string,
    options?: { provider?: string; force_fresh?: boolean },
  ): Promise<NinVerificationResult>;
}
