import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('jupeb_result_entries')
@Index('idx_jupeb_result_entries_unique', ['registrationId', 'source', 'sitting', 'serial'], { unique: true })
@Index('idx_jupeb_result_entries_registration', ['registrationId'])
@Index('idx_jupeb_result_entries_origin', ['origin'])
export class ResultEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ type: 'varchar', length: 20 })
  source: string;

  @Column({ type: 'integer' })
  sitting: number;

  @Column({ type: 'integer' })
  serial: number;

  @Column({ type: 'text' })
  subject: string;

  @Column({ type: 'varchar', length: 4 })
  grade: string;

  @Column({ name: 'grade_normalized', type: 'char', length: 1, nullable: true })
  gradeNormalized: string | null;

  @Column({ type: 'integer', nullable: true })
  score: number | null;

  @Column({ type: 'varchar', length: 10, default: 'manual' })
  origin: string;

  @Column({ name: 'ocr_job_id', type: 'uuid', nullable: true })
  ocrJobId: string | null;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
