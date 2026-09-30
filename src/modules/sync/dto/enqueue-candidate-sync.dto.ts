export interface EnqueueCandidateSyncDto {
  sessionId: string;
  registrationIds?: string[];
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
}

export interface CandidateSyncJobPayload {
  sessionId: string;
  registrationIds?: string[];
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
}
