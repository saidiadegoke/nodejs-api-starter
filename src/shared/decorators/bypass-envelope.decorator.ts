import { SetMetadata } from '@nestjs/common';

export const BYPASS_ENVELOPE_KEY = 'BYPASS_ENVELOPE';

/**
 * Opt-out decorator for routes that stream files, PDFs, CSVs, or need raw responses
 * without being wrapped in the standard { success: true, message, data } envelope.
 */
export const BypassEnvelope = () => SetMetadata(BYPASS_ENVELOPE_KEY, true);
export const RawResponse = BypassEnvelope;
