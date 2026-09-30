import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SessionStatus {
  OPEN = 'open',
  CLOSED = 'closed',
}

@Entity('jupeb_registration_sessions')
@Index('idx_jupeb_sessions_status', ['status'])
@Index('idx_jupeb_sessions_dates', ['opensAt', 'closesAt'])
export class AcademicSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'academic_year', type: 'varchar', length: 9, unique: true })
  academicYear: string;

  @Column({ name: 'year_short', type: 'char', length: 2 })
  yearShort: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: SessionStatus.OPEN,
  })
  status: SessionStatus;

  @Column({ name: 'opens_at', type: 'timestamp without time zone' })
  opensAt: Date;

  @Column({ name: 'closes_at', type: 'timestamp without time zone' })
  closesAt: Date;

  @Column({
    name: 'student_submission_deadline',
    type: 'timestamp without time zone',
    nullable: true,
  })
  studentSubmissionDeadline: Date | null;

  @Column({
    name: 'institution_approval_deadline',
    type: 'timestamp without time zone',
    nullable: true,
  })
  institutionApprovalDeadline: Date | null;

  @Column({ name: 'registration_locked', type: 'boolean', default: false })
  registrationLocked: boolean;

  @Column({ name: 'results_released_to_institutions', type: 'boolean', default: false })
  resultsReleasedToInstitutions: boolean;

  @Column({
    name: 'results_released_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  resultsReleasedAt: Date | null;

  @Column({ name: 'results_released_by', type: 'uuid', nullable: true })
  resultsReleasedBy: string | null;

  @Column({
    name: 'final_numbers_generated_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  finalNumbersGeneratedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @Column({
    name: 'registration_fee_amount',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  registrationFeeAmount: number | null;

  @Column({
    name: 'registration_fee_currency',
    type: 'varchar',
    length: 3,
    default: 'NGN',
    nullable: true,
  })
  registrationFeeCurrency: string | null;

  @Column({
    name: 'candidate_info_cutoff_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  candidateInfoCutoffAt: Date | null;

  @Column({
    name: 'profile_update_cutoff_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  profileUpdateCutoffAt: Date | null;

  @Column({
    name: 'ca_cutoff_at',
    type: 'timestamp without time zone',
    nullable: true,
  })
  caCutoffAt: Date | null;

  @Column({ name: 'max_ca_score', type: 'int', nullable: true })
  maxCaScore: number | null;

  @Column({
    name: 'affiliation_fee_existing',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  affiliationFeeExisting: number | null;

  @Column({
    name: 'affiliation_fee_new',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  affiliationFeeNew: number | null;

  @Column({
    name: 'exam_fee_per_candidate',
    type: 'numeric',
    precision: 12,
    scale: 2,
    nullable: true,
  })
  examFeePerCandidate: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
