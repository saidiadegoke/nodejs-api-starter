import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum NinVerificationStatus {
  VERIFIED = 'verified',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('jupeb_nin_verifications')
@Index('idx_nin_verifications_nin_hash', ['ninHash'])
@Index('idx_nin_verifications_status_created', ['status', 'createdAt'])
export class NinVerificationEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nin_hash', type: 'char', length: 64 })
  ninHash: string;

  @Column({ name: 'nin_last4', type: 'char', length: 4 })
  ninLast4: string;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ name: 'provider_reference', type: 'varchar', length: 120, nullable: true })
  providerReference: string | null;

  @Column({ name: 'idempotency_key', type: 'varchar', length: 128, nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'varchar', length: 20 })
  status: NinVerificationStatus;

  @Column({ name: 'response_payload', type: 'jsonb', default: {} })
  responsePayload: Record<string, unknown>;

  @Column({ name: 'error_payload', type: 'jsonb', default: {} })
  errorPayload: Record<string, unknown>;

  @Column({ name: 'intake_payload', type: 'jsonb', nullable: true, default: {} })
  intakePayload: Record<string, unknown> | null;

  @Column({ name: 'verified_at', type: 'timestamp without time zone', nullable: true })
  verifiedAt: Date | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requestedBy: string | null;

  @Column({ name: 'retry_after', type: 'timestamptz', nullable: true })
  retryAfter: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount: number;

  @Column({ name: 'last_attempt_at', type: 'timestamptz', nullable: true })
  lastAttemptAt: Date | null;

  @Column({ name: 'last_error_code', type: 'varchar', length: 50, nullable: true })
  lastErrorCode: string | null;

  @Column({ name: 'cleared_at', type: 'timestamptz', nullable: true })
  clearedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;
}
