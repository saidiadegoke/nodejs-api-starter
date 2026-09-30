import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { LoggerFactory } from '../../../logger';
import { RegistrationRepository } from '../../registration/repositories/registration.repository';
import { CourseRepository } from '../../courses/repositories/course.repository';
import { UserRepository } from '../../users/repositories/user.repository';
import { RegistrationResultRepository } from '../repositories/registration-result.repository';
import { RegistrationScoreRepository } from '../repositories/registration-score.repository';
import { UpsertResultsDto } from '../dto';

const VALID_GRADES = new Set(['A', 'B', 'C', 'D', 'E', 'F']);
const ROLE_RESULT_ENTRY = new Set(['registrar', 'institution_admin', 'admin', 'super_admin']);
const ROLE_RECOMPUTE = new Set(['registrar', 'admin', 'super_admin']);
const ROLE_SCORE_PRIVILEGED_READ = new Set([
  'registrar',
  'institution_admin',
  'program_director',
  'admin',
  'super_admin',
]);

function isValidGrade(grade: string): boolean {
  return typeof grade === 'string' && VALID_GRADES.has(grade.toUpperCase());
}

function normalizeGrade(grade: string): string {
  return String(grade).trim().toUpperCase().slice(0, 1);
}

function gradeToPlusOneAwarded(grade: string): boolean {
  const g = normalizeGrade(grade);
  if (!isValidGrade(g)) return false;
  return g !== 'F';
}

function aggregateScoresFromResults(rows: Array<{ grade: string }>) {
  let passed = 0;
  let failed = 0;
  let plusOne = 0;
  for (const row of rows) {
    const g = normalizeGrade(row.grade);
    if (g === 'F') failed += 1;
    else if (isValidGrade(g)) {
      passed += 1;
      plusOne += 1;
    }
  }
  return {
    passed_courses_count: passed,
    failed_courses_count: failed,
    plus_one_total: plusOne,
  };
}

@Injectable()
export class AcademicService {
  private readonly logger;

  constructor(
    private readonly regRepo: RegistrationRepository,
    private readonly courseRepo: CourseRepository,
    private readonly resultRepo: RegistrationResultRepository,
    private readonly scoreRepo: RegistrationScoreRepository,
    private readonly userRepo: UserRepository,
    private readonly loggerFactory: LoggerFactory,
  ) {
    this.logger = this.loggerFactory.create(AcademicService.name);
  }

  private async userHasAnyRole(userId: string, set: Set<string>): Promise<boolean> {
    const roles = await this.userRepo.findUserRoles(userId);
    return roles.some((r) => set.has(r.role));
  }

  private async assertRegistrationExists(registrationId: string) {
    const reg = await this.regRepo.findById(registrationId);
    if (!reg) throw new NotFoundException('Registration not found');
    return reg;
  }

  private async assertCanReadAcademic(registrationUserId: string | null, userId: string) {
    if (registrationUserId && registrationUserId === userId) return;
    const ok = await this.userHasAnyRole(userId, ROLE_SCORE_PRIVILEGED_READ);
    if (!ok) throw new ForbiddenException('Forbidden');
  }

  private async assertCanEnterResults(userId: string) {
    const ok = await this.userHasAnyRole(userId, ROLE_RESULT_ENTRY);
    if (!ok) throw new ForbiddenException('Forbidden');
  }

  private async assertCanRecompute(userId: string) {
    const ok = await this.userHasAnyRole(userId, ROLE_RECOMPUTE);
    if (!ok) throw new ForbiddenException('Forbidden');
  }

  async listResults(registrationId: string, userId: string) {
    const reg = await this.assertRegistrationExists(registrationId);
    await this.assertCanReadAcademic(reg.userId, userId);
    return this.resultRepo.findByRegistrationId(registrationId);
  }

  async getScore(registrationId: string, userId: string) {
    const reg = await this.assertRegistrationExists(registrationId);
    await this.assertCanReadAcademic(reg.userId, userId);
    const results = await this.resultRepo.findByRegistrationId(registrationId);
    const aggregate = aggregateScoresFromResults(results);
    const snapshot = await this.scoreRepo.findByRegistrationId(registrationId);
    return {
      registration_id: registrationId,
      results,
      aggregate,
      snapshot,
    };
  }

  async upsertResults(registrationId: string, body: UpsertResultsDto, userId: string) {
    await this.assertCanEnterResults(userId);
    await this.assertRegistrationExists(registrationId);
    const results = body && Array.isArray(body.results) ? body.results : null;
    if (!results || !results.length) {
      throw new UnprocessableEntityException('results must be a non-empty array of { course_id, grade }');
    }
    const out = [];
    for (const row of results) {
      const grade = row.grade !== undefined ? normalizeGrade(row.grade) : '';
      if (!isValidGrade(grade)) {
        throw new UnprocessableEntityException(`Invalid grade for course ${row.course_id}; use A–F`);
      }
      const course = await this.courseRepo.findById(row.course_id);
      if (!course || course.status !== 'active') {
        throw new NotFoundException(`Course not found or inactive: ${row.course_id}`);
      }
      const plus = gradeToPlusOneAwarded(grade);
      const saved = await this.resultRepo.upsertRow({
        registrationId,
        courseId: row.course_id,
        grade,
        plusOneAwarded: plus,
        enteredBy: userId,
      });
      out.push(saved);
    }
    await this._recomputeSnapshot(registrationId);
    return out;
  }

  async recomputeScore(registrationId: string, userId: string) {
    await this.assertCanRecompute(userId);
    await this.assertRegistrationExists(registrationId);
    return this._recomputeSnapshot(registrationId);
  }

  private async _recomputeSnapshot(registrationId: string) {
    const results = await this.resultRepo.findByRegistrationId(registrationId);
    const aggregate = aggregateScoresFromResults(results);
    return this.scoreRepo.upsertSnapshot({
      registrationId,
      passedCoursesCount: aggregate.passed_courses_count,
      failedCoursesCount: aggregate.failed_courses_count,
      plusOneTotal: aggregate.plus_one_total,
    });
  }
}
