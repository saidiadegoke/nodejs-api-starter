import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type DocumentRequirementStatus = 'active' | 'inactive';

@Entity({ name: 'jupeb_document_requirements' })
export class DocumentRequirementEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 60 })
  key: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'boolean', default: true, name: 'is_mandatory' })
  isMandatory: boolean;

  @Column({ type: 'jsonb', default: [], name: 'allowed_mime_types' })
  allowedMimeTypes: string[];

  @Column({ type: 'int', default: 10, name: 'max_file_size_mb' })
  maxFileSizeMb: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'active',
  })
  status: DocumentRequirementStatus;

  @CreateDateColumn({ type: 'timestamp', name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
  updatedAt: Date;
}
