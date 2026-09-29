export interface EnqueueSubjectSyncDto {
  subjectIds?: string[];
  syncAll?: boolean;
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
}

export interface SubjectSyncJobPayload {
  subjectIds?: string[];
  syncAll?: boolean;
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
  syncLogId?: string;
}
