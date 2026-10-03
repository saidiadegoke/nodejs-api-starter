import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { SyncExecutorService } from '../services/sync-executor.service';
import {
  SyncEvent,
  InstitutionUpdatedEvent,
  SubjectUpdatedEvent,
  CandidateUpdatedEvent,
} from '../constants/sync-events.enum';

const CONTEXT = 'SyncEventListener';

@Injectable()
export class SyncEventListener {
  private readonly logger = new Logger(CONTEXT);

  constructor(private readonly syncExecutor: SyncExecutorService) {}

  @OnEvent(SyncEvent.INSTITUTION_UPDATED, { async: true })
  async handleInstitutionUpdated(event: InstitutionUpdatedEvent) {
    this.logger.log(`[Event: ${SyncEvent.INSTITUTION_UPDATED}] Syncing updated institution ${event.universityId} to Attendance & CRMS`);
    try {
      await this.syncExecutor.syncInstitutions([event.universityId], false);
      this.logger.log(`[Event: ${SyncEvent.INSTITUTION_UPDATED}] Completed async sync for institution ${event.universityId}`);
    } catch (err: any) {
      this.logger.warn(`[Event: ${SyncEvent.INSTITUTION_UPDATED}] Failed async sync for institution ${event.universityId}: ${err.message}`);
    }
  }

  @OnEvent(SyncEvent.SUBJECT_UPDATED, { async: true })
  async handleSubjectUpdated(event: SubjectUpdatedEvent) {
    this.logger.log(`[Event: ${SyncEvent.SUBJECT_UPDATED}] Syncing updated subject ${event.subjectId} to Attendance & CRMS`);
    try {
      await this.syncExecutor.syncSubjects([event.subjectId], false);
      this.logger.log(`[Event: ${SyncEvent.SUBJECT_UPDATED}] Completed async sync for subject ${event.subjectId}`);
    } catch (err: any) {
      this.logger.warn(`[Event: ${SyncEvent.SUBJECT_UPDATED}] Failed async sync for subject ${event.subjectId}: ${err.message}`);
    }
  }

  @OnEvent(SyncEvent.CANDIDATE_UPDATED, { async: true })
  async handleCandidateUpdated(event: CandidateUpdatedEvent) {
    this.logger.log(`[Event: ${SyncEvent.CANDIDATE_UPDATED}] Syncing updated candidate registration ${event.registrationId} to Attendance & CRMS`);
    try {
      await this.syncExecutor.syncCandidates([event.registrationId]);
      this.logger.log(`[Event: ${SyncEvent.CANDIDATE_UPDATED}] Completed async sync for candidate ${event.registrationId}`);
    } catch (err: any) {
      this.logger.warn(`[Event: ${SyncEvent.CANDIDATE_UPDATED}] Failed async sync for candidate ${event.registrationId}: ${err.message}`);
    }
  }
}

