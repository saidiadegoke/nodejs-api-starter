import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum RegistrationDocumentStatus {
  SUBMITTED = 'submitted',
  REPLACED = 'replaced',
  REJECTED = 'rejected',
  ACCEPTED = 'accepted',
  DELETED = 'deleted',
}

@Entity('jupeb_registration_documents')
@Index('idx_registration_documents_registration_id', ['registrationId'])
@Index('idx_registration_documents_status', ['status'])
export class RegistrationDocumentEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({ name: 'requirement_id', type: 'uuid' })
  requirementId: string;

  @Column({ name: 'file_id', type: 'uuid' })
  fileId: string;

  @Column({
    type: 'varchar',
    length: 20,
    default: RegistrationDocumentStatus.SUBMITTED,
  })
  status: RegistrationDocumentStatus;

  @Column({ name: 'review_note', type: 'text', nullable: true })
  reviewNote: string | null;

  @Column({ type: 'varchar', length: 20, nullable: true })
  source: string | null;

  @Column({ type: 'integer', nullable: true })
  sitting: number | null;

  @Column({ name: 'institution_type', type: 'varchar', length: 50, nullable: true })
  institutionType: string | null;

  @Column({ name: 'reviewed_by', type: 'uuid', nullable: true })
  reviewedBy: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp without time zone', nullable: true })
  reviewedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp without time zone' })
  updatedAt: Date;
}
