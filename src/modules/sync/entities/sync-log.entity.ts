import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum SyncEntityType {
  CANDIDATE = 'candidate',
  SUBJECT = 'subject',
  INSTITUTION = 'institution',
  BULK_SESSION = 'bulk_session',
}

export enum SyncTarget {
  ALL = 'all',
  ATTENDANCE = 'attendance',
  CRMS = 'crms',
}

export enum SyncStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  PARTIAL = 'partial',
}

@Entity('jupeb_sync_logs')
@Index('idx_sync_logs_entity', ['entityType', 'entityId'])
@Index('idx_sync_logs_status', ['status'])
@Index('idx_sync_logs_created_at', ['createdAt'])
export class SyncLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'entity_type',
    type: 'varchar',
    length: 50,
  })
  entityType: SyncEntityType;

  @Column({ name: 'entity_id', type: 'varchar', length: 255, nullable: true })
  entityId: string | null;

  @Column({
    type: 'varchar',
    length: 50,
    default: SyncTarget.ALL,
  })
  target: SyncTarget;

  @Column({
    type: 'varchar',
    length: 30,
    default: SyncStatus.PENDING,
  })
  status: SyncStatus;

  @Column({ name: 'job_id', type: 'varchar', length: 255, nullable: true })
  jobId: string | null;

  @Column({ name: 'attempt_count', type: 'int', default: 1 })
  attemptCount: number;

  @Column({ name: 'max_attempts', type: 'int', default: 5 })
  maxAttempts: number;

  @Column({ name: 'triggered_by', type: 'varchar', length: 100, nullable: true })
  triggeredBy: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, any> | null;

  @Column({ name: 'response_payload', type: 'jsonb', nullable: true })
  responsePayload: Record<string, any> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'error_details', type: 'jsonb', nullable: true })
  errorDetails: Record<string, any> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
