export interface EnqueueInstitutionSyncDto {
  universityIds?: string[];
  syncAll?: boolean;
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
}

export interface InstitutionSyncJobPayload {
  universityIds?: string[];
  syncAll?: boolean;
  userId?: string | null;
  triggeredBy?: string;
  metadata?: Record<string, any>;
  syncLogId?: string;
}
