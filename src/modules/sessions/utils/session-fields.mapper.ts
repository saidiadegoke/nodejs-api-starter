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
