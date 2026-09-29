/**
 * BullMQ queue names.
 *
 * Most queues are produced by Nest and consumed by Python workers in the
 * `commod-ai-workers` repo. The `MATCHMAKING` queue is an exception — it
 * is the first in-process Node consumer in this codebase (see
 * `src/modules/matchmaking/processors/matchmaking.processor.ts`).
 *
 * Keep names in sync with `commod-ai-workers/configs/bullmq-queues.yaml`
 * (excluding `MATCHMAKING`, which has no Python counterpart).
 */
export const AI_QUEUES = {
  OCR_INGESTION: 'ocr-ingestion',
  FIELD_EXTRACTION: 'field-extraction',
  CONTRACT_EXTRACTION: 'contract-extraction',
  CROSSCHECK: 'crosscheck',
  INSPECTION_DELTA: 'inspection-delta',
  SENTIMENT: 'sentiment',
  DOCUMENT_VERIFICATION: 'document-verification',
  CONTEXT_SYNC: 'context-sync',
  MATCHMAKING: 'matchmaking',
  KB_INGESTION: 'kb-ingestion',
  // COM-419: the DVL worker enqueues here when its async agents downgrade a
  // document's reliance to NOT_RELIABLE; this NestJS consumer opens a review.
  DVL_RELIANCE_REVIEW: 'dvl-reliance-review',
  FIELD_EXTRACTION_RESULT: 'field-extraction-result',
  CREDENTIAL_VERIFY: 'credential-verify',
  CREDENTIAL_VERIFY_RESULT: 'credential-verify-result',
} as const;

export const SYNC_QUEUES = {
  CANDIDATE_SYNC: 'candidate-sync',
} as const;

export type SyncQueueName = (typeof SYNC_QUEUES)[keyof typeof SYNC_QUEUES];
export type AiQueueName = (typeof AI_QUEUES)[keyof typeof AI_QUEUES];
