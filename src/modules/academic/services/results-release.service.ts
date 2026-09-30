import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../../logger';
import { SessionRepository } from '../../sessions/repositories/session.repository';
import { InstitutionSessionResultRepository } from '../repositories/institution-session-result.repository';
import { RegistrationRepository } from '../../registration/repositories/registration.repository';
import { InstitutionUserScopeService } from '../../registration/services/institution-user-scope.service';
import {
  ReleaseToInstitutionsDto,
  ReleaseToStudentsDto,
  InstitutionResultsQueryDto,
} from '../dto';

@Injectable()
export class ResultsReleaseService {
  private readonly logger;

  constructor(
    private readonly sessionRepo: SessionRepository,
    private readonly instSessionRepo: InstitutionSessionResultRepository,
    private readonly regRepo: RegistrationRepository,
    private readonly scopeService: InstitutionUserScopeService,
    private readonly dataSource: DataSource,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(ResultsReleaseService.name);
  }

  async releaseToInstitutions(userId: string, payload: ReleaseToInstitutionsDto) {
    const session = payload.session_id
      ? await this.sessionRepo.findById(payload.session_id)
      : payload.academic_year
      ? await this.sessionRepo.findByAcademicYear(payload.academic_year)
      : await this.sessionRepo.findActive();

    if (!session) {
      throw new NotFoundException({
        message: 'Academic session not found',
        error_code: 'session_not_found',
      });
    }

    const release = payload.release !== undefined ? payload.release : true;

    await this.sessionRepo.update(session.id, {
      resultsReleasedToInstitutions: release,
      resultsReleasedAt: release ? new Date() : null,
      resultsReleasedBy: userId || null,
    });

    const updated = await this.sessionRepo.findById(session.id);

    return {
      session_id: updated!.id,
      academic_year: updated!.academicYear,
      results_released_to_institutions: updated!.resultsReleasedToInstitutions,
      results_released_at: updated!.resultsReleasedAt?.toISOString() || null,
      released_by: updated!.resultsReleasedBy,
    };
  }

  async getInstitutionResults(userId: string, query: InstitutionResultsQueryDto) {
    const session = query.session_id
      ? await this.sessionRepo.findById(query.session_id)
      : query.academic_year
      ? await this.sessionRepo.findByAcademicYear(query.academic_year)
      : await this.sessionRepo.findActive();

    if (!session) {
      throw new NotFoundException({
        message: 'Academic session not found',
        error_code: 'session_not_found',
      });
    }

    const universityId = await this.scopeService.effectiveUniversityId(userId, query.university_id);
    if (!universityId) {
      throw new BadRequestException({
        message: 'University ID is required for institution results',
        error_code: 'university_id_required',
      });
    }

    if (!session.resultsReleasedToInstitutions) {
      throw new ForbiddenException({
        message: 'JUPEB has not yet released the results for this academic session to institutions.',
        error_code: 'RESULTS_NOT_YET_RELEASED',
        academic_year: session.academicYear,
      });
    }

    const instSession = await this.instSessionRepo.findBySessionAndUniversity(session.id, universityId);

    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(Number(query.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const values: any[] = [session.id, universityId];
    let queryFilter = '';
    if (query.q) {
      values.push(`%${query.q}%`);
      const idx = values.length;
      queryFilter = `AND (
        r.jupeb_candidate_number ILIKE $${idx} OR 
        r.provisional_candidate_code ILIKE $${idx} OR 
        p.first_name ILIKE $${idx} OR 
        p.last_name ILIKE $${idx} OR 
        u.email ILIKE $${idx}
      )`;
    }

    const countRes = await this.dataSource.query(
      `SELECT COUNT(*)::int AS total
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       WHERE r.session_id = $1 AND r.university_id = $2 ${queryFilter}`,
      values,
    );

    const rowsRes = await this.dataSource.query(
      `SELECT r.id, r.session_id, r.university_id, r.user_id,
              r.jupeb_candidate_number, r.provisional_candidate_code,
              r.status, r.payment_projection, r.is_result_released, r.result_released_at,
              p.first_name, p.last_name, p.display_name, u.phone, u.email
       FROM jupeb_registrations r
       LEFT JOIN users u ON u.id = r.user_id
       LEFT JOIN profiles p ON p.user_id = r.user_id
       WHERE r.session_id = $1 AND r.university_id = $2 ${queryFilter}
       ORDER BY r.created_at DESC
       LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, limit, offset],
    );

    return {
      session: {
        id: session.id,
        academic_year: session.academicYear,
        results_released_to_institutions: session.resultsReleasedToInstitutions,
        results_released_at: session.resultsReleasedAt,
      },
      institution_release: {
        university_id: universityId,
        results_released_to_students: Boolean(instSession?.resultsReleasedToStudents),
        students_results_released_at: instSession?.studentsResultsReleasedAt || null,
      },
      pagination: {
        total: countRes[0]?.total || 0,
        page,
        limit,
        totalPages: Math.ceil((countRes[0]?.total || 0) / limit),
      },
      candidates: rowsRes,
    };
  }

  async releaseToStudents(userId: string, payload: ReleaseToStudentsDto) {
    const session = payload.session_id
      ? await this.sessionRepo.findById(payload.session_id)
      : payload.academic_year
      ? await this.sessionRepo.findByAcademicYear(payload.academic_year)
      : await this.sessionRepo.findActive();

    if (!session) {
      throw new NotFoundException({
        message: 'Academic session not found',
        error_code: 'session_not_found',
      });
    }

    if (!session.resultsReleasedToInstitutions) {
      throw new BadRequestException({
        message: 'Cannot release results to students before central JUPEB release.',
        error_code: 'CENTRAL_RELEASE_REQUIRED',
        academic_year: session.academicYear,
      });
    }

    const universityId = await this.scopeService.effectiveUniversityId(userId, payload.university_id);
    if (!universityId) {
      throw new BadRequestException({
        message: 'University ID is required to release student results',
        error_code: 'university_id_required',
      });
    }

    await this.scopeService.assertUniversityAccess(userId, universityId);

    let releasedCount = 0;
    let instRecord = null;

    if (payload.release_all) {
      instRecord = await this.instSessionRepo.upsertInstitutionRelease(
        session.id,
        universityId,
        true,
        userId,
      );
      const res = await this.dataSource.query(
        `UPDATE jupeb_registrations
         SET is_result_released = true,
             result_released_at = CURRENT_TIMESTAMP,
             result_released_by = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND university_id = $2
         RETURNING id`,
        [session.id, universityId, userId || null],
      );
      releasedCount = res.length;
    } else if (Array.isArray(payload.registration_ids) && payload.registration_ids.length > 0) {
      const res = await this.dataSource.query(
        `UPDATE jupeb_registrations
         SET is_result_released = true,
             result_released_at = CURRENT_TIMESTAMP,
             result_released_by = $4,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = $1 AND university_id = $2 AND id = ANY($3::uuid[])
         RETURNING id`,
        [session.id, universityId, payload.registration_ids, userId || null],
      );
      releasedCount = res.length;
      instRecord = await this.instSessionRepo.findBySessionAndUniversity(session.id, universityId);
    } else {
      throw new BadRequestException({
        message: 'Either release_all must be true or registration_ids must be provided',
        error_code: 'invalid_release_parameters',
      });
    }

    return {
      session_id: session.id,
      academic_year: session.academicYear,
      university_id: universityId,
      release_all: Boolean(payload.release_all),
      released_count: releasedCount,
      results_released_to_students: Boolean(instRecord?.resultsReleasedToStudents),
      students_results_released_at: instRecord?.studentsResultsReleasedAt || null,
    };
  }

  async checkStudentReleaseAccess(studentContext: {
    session_id?: string;
    university_id?: string;
    registration_id?: string;
  }) {
    const { session_id, university_id, registration_id } = studentContext;
    if (!session_id || !university_id || !registration_id) return true;

    const rows = await this.dataSource.query(
      `SELECT 
         s.results_released_to_institutions,
         s.results_released_at AS central_released_at,
         COALESCE(isr.results_released_to_students, false) AS institution_released_to_all,
         isr.students_results_released_at AS institution_released_at,
         COALESCE(r.is_result_released, false) AS registration_released,
         r.result_released_at AS student_released_at
       FROM jupeb_registration_sessions s
       LEFT JOIN jupeb_institution_session_results isr 
         ON isr.session_id = s.id AND isr.university_id = $2
       LEFT JOIN jupeb_registrations r 
         ON r.id = $3
       WHERE s.id = $1`,
      [session_id, university_id, registration_id],
    );
    const status = rows[0];
    if (!status) return true;

    if (!status.results_released_to_institutions) {
      throw new ForbiddenException({
        message: 'Results for the active session have not yet been released by JUPEB.',
        error_code: 'RESULTS_NOT_YET_RELEASED',
      });
    }

    if (!status.institution_released_to_all && !status.registration_released) {
      throw new ForbiddenException({
        message:
          'Results have not yet been released by your institution. Please contact your institution coordinator or check clearance status.',
        error_code: 'INSTITUTION_HOLD',
      });
    }

    return true;
  }
}
