export enum SyncEvent {
  INSTITUTION_UPDATED = 'institution.updated',
  SUBJECT_UPDATED = 'subject.updated',
  CANDIDATE_UPDATED = 'candidate.updated',
}

export enum SyncQueue {
  CANDIDATE = 'candidate-sync',
  SUBJECT = 'subject-sync',
  INSTITUTION = 'institution-sync',
}

export interface InstitutionUpdatedEvent {
  universityId: string;
  userId?: string;
  data: Record<string, any>;
}

export interface SubjectUpdatedEvent {
  subjectId: string;
  userId?: string;
  data: Record<string, any>;
}

export interface CandidateUpdatedEvent {
  registrationId: string;
  userId?: string;
  data: Record<string, any>;
}
