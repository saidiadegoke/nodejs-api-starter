import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

import { RegistrationStatus } from '../../../shared/enums';

export { RegistrationStatus };

@Entity('jupeb_registrations')
@Index('idx_jupeb_registrations_user_id', ['userId'])
@Index('idx_jupeb_registrations_session_id', ['sessionId'])
@Index('idx_registrations_session_status', ['sessionId', 'status'])
@Index('idx_registrations_university_status', ['universityId', 'status'])
@Index('idx_registrations_institution_code', ['institutionIssuedCode'])
export class RegistrationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId: string;

  @Column({ name: 'university_id', type: 'uuid' })
  universityId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'nin_verification_id', type: 'uuid', nullable: true })
  ninVerificationId: string | null;

  @Column({ name: 'subject_combination_id', type: 'uuid', nullable: true })
  subjectCombinationId: string | null;

  @Column({ name: 'institution_issued_code', type: 'varchar', length: 32, nullable: true })
  institutionIssuedCode: string | null;

  @Column({ name: 'provisional_serial', type: 'int', nullable: true })
  provisionalSerial: number | null;

  @Column({ name: 'provisional_candidate_code', type: 'varchar', length: 20, nullable: true })
  provisionalCandidateCode: string | null;

  @Column({ name: 'jupeb_candidate_number', type: 'varchar', length: 20, nullable: true, unique: true })
  jupebCandidateNumber: string | null;

  @Column({
    type: 'varchar',
    length: 30,
    default: RegistrationStatus.PROVISIONAL,
  })
  status: RegistrationStatus;

  @Column({ name: 'status_reason', type: 'text', nullable: true })
  statusReason: string | null;

  @Column({ name: 'dashboard_unlocked_at', type: 'timestamp without time zone', nullable: true })
  dashboardUnlockedAt: Date | null;

  @Column({ name: 'claimed_at', type: 'timestamp without time zone', nullable: true })
  claimedAt: Date | null;

  @Column({ name: 'submitted_at', type: 'timestamp without time zone', nullable: true })
  submittedAt: Date | null;

  @Column({ name: 'approved_at', type: 'timestamp without time zone', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'approved_by', type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'payment_projection', type: 'varchar', length: 30, nullable: true, default: 'unpaid' })
  paymentProjection: string | null;

  @Column({ name: 'is_result_released', type: 'boolean', default: false })
  isResultReleased: boolean;

  @Column({ name: 'result_released_at', type: 'timestamp without time zone', nullable: true })
  resultReleasedAt: Date | null;

  @Column({ name: 'result_released_by', type: 'uuid', nullable: true })
  resultReleasedBy: string | null;

  @Column({ name: 'attendance_registration_code', type: 'varchar', length: 100, nullable: true })
  attendanceRegistrationCode: string | null;

  @Column({ name: 'attendance_student_id', type: 'varchar', length: 100, nullable: true })
  attendanceStudentId: string | null;

  @Column({ name: 'institution_code_expires_at', type: 'timestamp without time zone', nullable: true })
  institutionCodeExpiresAt: Date | null;

  @Column({ name: 'face_skipped_at', type: 'timestamp without time zone', nullable: true })
  faceSkippedAt: Date | null;

  @Column({ name: 'fingerprint_skipped_at', type: 'timestamp without time zone', nullable: true })
  fingerprintSkippedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
