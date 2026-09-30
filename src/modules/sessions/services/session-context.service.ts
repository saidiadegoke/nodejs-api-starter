import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileEntity } from '../../users/entities/profile.entity';
import { SessionRepository } from '../repositories/session.repository';
import { SessionUniversityLockRepository } from '../repositories/session-university-lock.repository';
import { AcademicSessionEntity } from '../entities/academic-session.entity';
import {
  evaluateSessionWindows,
} from '../utils/session-validation.util';
import { SessionSummaryDto, SessionContextResponseDto } from '../dto/session-context-response.dto';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

@Injectable()
export class SessionContextService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly lockRepo: SessionUniversityLockRepository,
    @InjectRepository(ProfileEntity)
    private readonly profileRepo: Repository<ProfileEntity>,
  ) {}

  toSessionSummary(
    session: AcademicSessionEntity | null,
    isInstitutionLocked = false,
  ): SessionSummaryDto | null {
    if (!session) return null;
    const windows = evaluateSessionWindows(session as any);
    const sessionLocked = Boolean(session.registrationLocked);
    const effectiveLocked = sessionLocked || Boolean(isInstitutionLocked);

    return {
      id: session.id,
      label: session.academicYear,
      status: session.status,
      registration_locked: effectiveLocked,
      session_registration_locked: sessionLocked,
      institution_registration_locked: Boolean(isInstitutionLocked),
      opens_at: session.opensAt ? session.opensAt.toISOString() : null,
      closes_at: session.closesAt ? session.closesAt.toISOString() : null,
      candidate_info_cutoff_at: windows.cutoffs.candidate_info.at,
      profile_update_cutoff_at: windows.cutoffs.profile_update.at,
      ca_cutoff_at: windows.cutoffs.ca.at,
      window_open: windows.within_window,
      candidate_info_closed: windows.cutoffs.candidate_info.passed,
      profile_update_closed: windows.cutoffs.profile_update.passed,
      ca_closed: windows.cutoffs.ca.passed,
    };
  }

  async getActiveSession(): Promise<AcademicSessionEntity | null> {
    return this.sessionRepo.findActiveOrLatest();
  }

  async getUserViewingSessionId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const profile = await this.profileRepo.findOne({
      where: { userId },
      select: ['id', 'userId', 'viewingJupebSessionId'],
    });
    return profile?.viewingJupebSessionId || null;
  }

  async getUserUniversityId(userId: string): Promise<string | null> {
    if (!userId) return null;
    const profile = await this.profileRepo.findOne({
      where: { userId },
      select: ['id', 'userId', 'jupebUniversityId'],
    });
    return profile?.jupebUniversityId || null;
  }

  async setUserViewingSession(userId: string, sessionId: string): Promise<AcademicSessionEntity> {
    if (!userId) throw new UnauthorizedException('Authentication required');
    if (!sessionId || !UUID_REGEX.test(sessionId)) {
      throw new UnprocessableEntityException('session_id is required and must be a valid UUID');
    }
    const session = await this.sessionRepo.findById(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    await this.profileRepo.update(
      { userId },
      {
        viewingJupebSessionId: sessionId,
        updatedAt: new Date(),
      },
    );
    return session;
  }

  async clearUserViewingSession(userId: string): Promise<void> {
    if (!userId) throw new UnauthorizedException('Authentication required');
    await this.profileRepo.update(
      { userId },
      {
        viewingJupebSessionId: null,
        updatedAt: new Date(),
      },
    );
  }

  async resolveEffectiveSession(
    userId?: string | null,
    querySessionId?: string | null,
  ): Promise<AcademicSessionEntity | null> {
    if (querySessionId) {
      if (!UUID_REGEX.test(querySessionId)) {
        throw new UnprocessableEntityException('session_id must be a valid UUID');
      }
      const session = await this.sessionRepo.findById(querySessionId);
      if (!session) throw new NotFoundException('Session not found');
      return session;
    }

    const viewingId = userId ? await this.getUserViewingSessionId(userId) : null;
    if (viewingId) {
      const viewing = await this.sessionRepo.findById(viewingId);
      if (viewing) return viewing;
    }
    return this.getActiveSession();
  }

  async getSessionContext(userId?: string | null): Promise<SessionContextResponseDto> {
    const activeSession = await this.getActiveSession();
    const viewingId = userId ? await this.getUserViewingSessionId(userId) : null;
    let viewingSession: AcademicSessionEntity | null = null;
    if (viewingId) {
      try {
        viewingSession = await this.sessionRepo.findById(viewingId);
      } catch {
        viewingSession = null;
      }
    }
    const effectiveSession = viewingSession || activeSession;

    const uniId = userId ? await this.getUserUniversityId(userId) : null;
    const checkUniLocked = async (session: AcademicSessionEntity | null) => {
      if (!session || !uniId) return false;
      return this.lockRepo.isUniversityRegistrationLocked(session.id, uniId);
    };

    const [activeUniLocked, viewingUniLocked, effectiveUniLocked] = await Promise.all([
      checkUniLocked(activeSession),
      checkUniLocked(viewingSession),
      checkUniLocked(effectiveSession),
    ]);

    return {
      active_session: this.toSessionSummary(activeSession, activeUniLocked),
      viewing_session: this.toSessionSummary(viewingSession, viewingUniLocked),
      effective_session: this.toSessionSummary(effectiveSession, effectiveUniLocked),
    };
  }
}
