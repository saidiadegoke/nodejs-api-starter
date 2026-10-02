import { UnprocessableEntityException } from '@nestjs/common';
import { AcademicSessionEntity } from '../entities/academic-session.entity';
import { CreateSessionDto, PatchSessionDto } from '../dto';

type SessionDto = CreateSessionDto | PatchSessionDto;

const DATE_FIELDS = {
  opens_at: 'opensAt',
  closes_at: 'closesAt',
  student_submission_deadline: 'studentSubmissionDeadline',
  institution_approval_deadline: 'institutionApprovalDeadline',
  candidate_info_cutoff_at: 'candidateInfoCutoffAt',
  profile_update_cutoff_at: 'profileUpdateCutoffAt',
  ca_cutoff_at: 'caCutoffAt',
} as const;

const NUMBER_FIELDS = {
  max_ca_score: 'maxCaScore',
  affiliation_fee_existing: 'affiliationFeeExisting',
  affiliation_fee_new: 'affiliationFeeNew',
  exam_fee_per_candidate: 'examFeePerCandidate',
  registration_fee_amount: 'registrationFeeAmount',
} as const;

const REQUIRED_TEXT_FIELDS = {
  academic_year: 'academicYear',
  year_short: 'yearShort',
} as const;

/**
 * Maps only the keys present on the DTO (`!== undefined`), so the same function
 * serves both create and partial-update (PATCH) semantics.
 */
export function mapSessionDtoToFields(dto: SessionDto): Partial<AcademicSessionEntity> {
  const src = dto as Record<string, any>;
  const fields: Record<string, unknown> = {};

  for (const [key, prop] of Object.entries(REQUIRED_TEXT_FIELDS)) {
    if (src[key] === undefined) continue;
    const value = String(src[key]).trim();
    if (!value) throw new UnprocessableEntityException(`${key} cannot be empty`);
    fields[prop] = value;
  }

  for (const [key, prop] of Object.entries(DATE_FIELDS)) {
    if (src[key] !== undefined) fields[prop] = src[key] ? new Date(src[key]) : null;
  }

  for (const [key, prop] of Object.entries(NUMBER_FIELDS)) {
    if (src[key] !== undefined) fields[prop] = src[key] != null ? Number(src[key]) : null;
  }

  if (src.registration_fee_currency !== undefined) {
    fields.registrationFeeCurrency = src.registration_fee_currency
      ? String(src.registration_fee_currency).trim().toUpperCase().slice(0, 3)
      : null;
  }

  const notes = src.notes !== undefined ? src.notes : src.description;
  if (notes !== undefined) fields.notes = notes || null;

  return fields as Partial<AcademicSessionEntity>;
}

type SessionDates = Pick<
  AcademicSessionEntity,
  'opensAt' | 'closesAt' | 'candidateInfoCutoffAt' | 'profileUpdateCutoffAt' | 'caCutoffAt'
>;

const formatTs = (d: Date) => d.toISOString().replace('T', ' ').substring(0, 16);

/** Validates opens < closes and closes <= candidate <= profile <= CA cutoffs. */
export function assertSessionDateRules(d: Partial<SessionDates>): void {
  if (d.opensAt && d.closesAt && d.opensAt.getTime() >= d.closesAt.getTime()) {
    throw new UnprocessableEntityException('opens_at must be before closes_at');
  }

  const chain = (
    [
      ['Session close date', d.closesAt],
      ['Candidate info cutoff', d.candidateInfoCutoffAt],
      ['Profile update cutoff', d.profileUpdateCutoffAt],
      ['CA cutoff', d.caCutoffAt],
    ] as [string, Date | null | undefined][]
  ).filter((entry): entry is [string, Date] => entry[1] != null);

  for (let i = 1; i < chain.length; i += 1) {
    const [prevName, prevTs] = chain[i - 1];
    const [name, ts] = chain[i];
    if (ts.getTime() < prevTs.getTime()) {
      throw new UnprocessableEntityException(
        `The ${name} (${formatTs(ts)}) cannot be earlier than the ${prevName} (${formatTs(prevTs)}).`,
      );
    }
  }
}

export function formatSession(session: AcademicSessionEntity | any) {
  if (!session) return session;
  const iso = (v: any) =>
    v instanceof Date ? v.toISOString() : v ? new Date(v).toISOString() : null;
  return {
    id: session.id,
    academic_year: session.academicYear ?? session.academic_year ?? null,
    academicYear: session.academicYear ?? session.academic_year ?? null,
    year_short: session.yearShort ?? session.year_short ?? null,
    yearShort: session.yearShort ?? session.year_short ?? null,
    opens_at: iso(session.opensAt ?? session.opens_at),
    opensAt: iso(session.opensAt ?? session.opens_at),
    closes_at: iso(session.closesAt ?? session.closes_at),
    closesAt: iso(session.closesAt ?? session.closes_at),
    student_submission_deadline: iso(
      session.studentSubmissionDeadline ?? session.student_submission_deadline,
    ),
    studentSubmissionDeadline: iso(
      session.studentSubmissionDeadline ?? session.student_submission_deadline,
    ),
    institution_approval_deadline: iso(
      session.institutionApprovalDeadline ?? session.institution_approval_deadline,
    ),
    institutionApprovalDeadline: iso(
      session.institutionApprovalDeadline ?? session.institution_approval_deadline,
    ),
    candidate_info_cutoff_at: iso(
      session.candidateInfoCutoffAt ?? session.candidate_info_cutoff_at,
    ),
    candidateInfoCutoffAt: iso(
      session.candidateInfoCutoffAt ?? session.candidate_info_cutoff_at,
    ),
    profile_update_cutoff_at: iso(
      session.profileUpdateCutoffAt ?? session.profile_update_cutoff_at,
    ),
    profileUpdateCutoffAt: iso(
      session.profileUpdateCutoffAt ?? session.profile_update_cutoff_at,
    ),
    ca_cutoff_at: iso(session.caCutoffAt ?? session.ca_cutoff_at),
    caCutoffAt: iso(session.caCutoffAt ?? session.ca_cutoff_at),
    status: session.status,
    affiliation_fee_existing:
      session.affiliationFeeExisting ?? session.affiliation_fee_existing ?? null,
    affiliationFeeExisting:
      session.affiliationFeeExisting ?? session.affiliation_fee_existing ?? null,
    affiliation_fee_new:
      session.affiliationFeeNew ?? session.affiliation_fee_new ?? null,
    affiliationFeeNew:
      session.affiliationFeeNew ?? session.affiliation_fee_new ?? null,
    exam_fee_per_candidate:
      session.examFeePerCandidate ?? session.exam_fee_per_candidate ?? null,
    examFeePerCandidate:
      session.examFeePerCandidate ?? session.exam_fee_per_candidate ?? null,
    registration_fee_amount:
      session.registrationFeeAmount ?? session.registration_fee_amount ?? null,
    registrationFeeAmount:
      session.registrationFeeAmount ?? session.registration_fee_amount ?? null,
    registration_fee_currency:
      session.registrationFeeCurrency ?? session.registration_fee_currency ?? 'NGN',
    registrationFeeCurrency:
      session.registrationFeeCurrency ?? session.registration_fee_currency ?? 'NGN',
    max_ca_score: session.maxCaScore ?? session.max_ca_score ?? 30,
    maxCaScore: session.maxCaScore ?? session.max_ca_score ?? 30,
    notes: session.notes ?? null,
    registration_locked:
      session.registrationLocked ?? session.registration_locked ?? false,
    registrationLocked:
      session.registrationLocked ?? session.registration_locked ?? false,
    final_numbers_generated_at: iso(
      session.finalNumbersGeneratedAt ?? session.final_numbers_generated_at,
    ),
    finalNumbersGeneratedAt: iso(
      session.finalNumbersGeneratedAt ?? session.final_numbers_generated_at,
    ),
    results_released_at: iso(
      session.resultsReleasedAt ?? session.results_released_at,
    ),
    resultsReleasedAt: iso(
      session.resultsReleasedAt ?? session.results_released_at,
    ),
    results_released_by:
      session.resultsReleasedBy ?? session.results_released_by ?? null,
    resultsReleasedBy:
      session.resultsReleasedBy ?? session.results_released_by ?? null,
    results_released_to_institutions:
      session.resultsReleasedToInstitutions ??
      session.results_released_to_institutions ??
      false,
    resultsReleasedToInstitutions:
      session.resultsReleasedToInstitutions ??
      session.results_released_to_institutions ??
      false,
    created_at: iso(session.createdAt ?? session.created_at),
    createdAt: iso(session.createdAt ?? session.created_at),
    updated_at: iso(session.updatedAt ?? session.updated_at),
    updatedAt: iso(session.updatedAt ?? session.updated_at),
    created_by: session.createdBy ?? session.created_by ?? null,
    createdBy: session.createdBy ?? session.created_by ?? null,
    updated_by: session.updatedBy ?? session.updated_by ?? null,
    updatedBy: session.updatedBy ?? session.updated_by ?? null,
  };
}
