import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ocr_jobs')
export class OcrJobEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  file_id: string | null;

  @Column({ name: 'exam_type', type: 'varchar', default: 'auto' })
  exam_type: string;

  @Column({ name: 'provider', type: 'varchar', default: 'pdf_text' })
  provider: string;

  @Column({ name: 'status', type: 'varchar', default: 'queued' })
  status: string;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attempt_count: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  max_attempts: number;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  error_code: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  error_message: string | null;

  @Column({ name: 'started_at', type: 'timestamp with time zone', nullable: true })
  started_at: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp with time zone', nullable: true })
  completed_at: Date | null;

  @Column({ name: 'requested_by', type: 'uuid', nullable: true })
  requested_by: string | null;

  @Column({ name: 'requested_for', type: 'uuid', nullable: true })
  requested_for: string | null;

  @Column({ name: 'context', type: 'varchar', nullable: true })
  context: string | null;

  @Column({ name: 'metadata', type: 'jsonb', default: {} })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
