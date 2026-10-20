import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileEntity } from '../../users/entities/profile.entity';
import { SessionRepository } from '../repositories/session.repository';
import { SessionUniversityLockRepository } from '../repositories/session-university-lock.repository';

/**
 * Roles that are not bound to a single institution. For these actors the
 * institution lock never applies unless the request explicitly targets a
 * university (e.g. an admin creating a registration for a locked university).
 */
const GLOBAL_ROLES = ['admin', 'super_admin', 'jupeb_admin', 'registrar'];

export interface RegistrationLockCheck {
  /** Session the action targets. Falls back to the active (open) session. */
  sessionId?: string | null;
  /** University the action targets. Falls back to the actor's institution. */
  universityId?: string | null;
  /** Actor performing the action, used to resolve the institution scope. */
  actorUserId?: string | null;
}

/**
 * Single source of truth for "is registration allowed right now?".
 *
 * Registration can be blocked at two levels:
 *  - session level: `jupeb_registration_sessions.registration_locked`
 *  - institution level: `jupeb_session_university_locks.locked` for a given
 *    (session_id, university_id) pair.
 *
 * Both are enforced with 423 Locked, matching the legacy JUPEB endpoints.
 */
@Injectable()
export class InstitutionRegistrationLockService {
  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly lockRepo: SessionUniversityLockRepository,
    @InjectRepository(ProfileEntity)
    private readonly profileRepo: Repository<ProfileEntity>,
  ) {}

  /**
   * Throws a 423 HttpException when registration is locked for the session or
   * for the institution the action targets. Returns normally when allowed.
   */
  async assertRegistrationAllowed(check: RegistrationLockCheck = {}): Promise<void> {
    const session = await this.resolveSession(check.sessionId);
    if (!session) return;

    // The session-wide lock only governs live registration; a closed session
    // is historical and must not block work on registrations it already holds.
    if (session.registrationLocked && session.status === 'open') {
      throw this.lockedException(
        'Registration is locked for this session',
        'session_registration_locked',
        session.id,
        null,
      );
    }

    const universityId =
      check.universityId || (await this.resolveActorUniversityId(check.actorUserId));
    if (!universityId) return;

    const institutionLocked = await this.lockRepo.isUniversityRegistrationLocked(
      session.id,
      universityId,
    );
    if (institutionLocked) {
      throw this.lockedException(
        'Registration is locked for this institution for the current session',
        'institution_registration_locked',
        session.id,
        universityId,
      );
    }
  }

  /** Non-throwing variant, for read paths that only need to surface the state. */
  async isRegistrationLocked(check: RegistrationLockCheck = {}): Promise<boolean> {
    try {
      await this.assertRegistrationAllowed(check);
      return false;
    } catch (err) {
      if (err instanceof HttpException && err.getStatus() === HttpStatus.LOCKED) return true;
      throw err;
    }
  }

  private async resolveSession(sessionId?: string | null) {
    if (sessionId) {
      // Unknown session: let the caller surface its own "session not found" error.
      return this.sessionRepo.findById(sessionId);
    }
    const active = await this.sessionRepo.findActiveOrLatest();
    if (!active) return null;
    // Only the open session governs live registration; closed sessions are
    // historical and must not block a new session's registration.
    return active.status === 'open' ? active : null;
  }

  /**
   * The institution the actor belongs to: profile scope, university
   * membership, or a university-owned role. Global roles have no institution.
   */
  private async resolveActorUniversityId(userId?: string | null): Promise<string | null> {
    if (!userId) return null;

    const [scopeRows, roleRows] = await Promise.all([
      this.profileRepo.query(
        `SELECT
           (SELECT p.jupeb_university_id FROM profiles p WHERE p.user_id = $1) AS profile_university_id,
           (SELECT uu.university_id FROM user_universities uu
             WHERE uu.user_id = $1 AND uu.deleted_at IS NULL
             ORDER BY uu.is_primary DESC NULLS LAST LIMIT 1) AS membership_university_id,
           (SELECT r.owner_jupeb_university_id FROM user_roles ur
              JOIN roles r ON r.id = ur.role_id
             WHERE ur.user_id = $1 AND r.owner_jupeb_university_id IS NOT NULL
               AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
             LIMIT 1) AS role_university_id`,
        [userId],
      ),
      this.profileRepo.query(
        `SELECT r.name FROM user_roles ur
           JOIN roles r ON r.id = ur.role_id
          WHERE ur.user_id = $1 AND (ur.expires_at IS NULL OR ur.expires_at > NOW())`,
        [userId],
      ),
    ]);

    const roles: string[] = (roleRows || []).map((row: any) => row.name);
    if (roles.some((role) => GLOBAL_ROLES.includes(role))) return null;

    const scope = scopeRows?.[0] || {};
    return (
      scope.profile_university_id ||
      scope.membership_university_id ||
      scope.role_university_id ||
      null
    );
  }

  private lockedException(
    message: string,
    errorCode: string,
    sessionId: string | null,
    universityId: string | null,
  ): HttpException {
    return new HttpException(
      {
        message,
        error_code: errorCode,
        details: {
          session_id: sessionId,
          university_id: universityId,
        },
      },
      HttpStatus.LOCKED,
    );
  }
}
