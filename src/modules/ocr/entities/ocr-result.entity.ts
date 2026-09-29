import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('ocr_results')
export class OcrResultEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'job_id', type: 'uuid' })
  job_id: string;

  @Column({ name: 'exam_type_detected', type: 'varchar', nullable: true })
  exam_type_detected: string | null;

  @Column({ name: 'confidence', type: 'numeric', nullable: true })
  confidence: number | null;

  @Column({ name: 'result_json', type: 'jsonb', default: {} })
  result_json: Record<string, any>;

  @Column({ name: 'raw_text', type: 'text', nullable: true })
  raw_text: string | null;

  @Column({ name: 'provider_payload', type: 'jsonb', default: {} })
  provider_payload: Record<string, any>;

  @Column({ name: 'page_count', type: 'int', default: 1 })
  page_count: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
