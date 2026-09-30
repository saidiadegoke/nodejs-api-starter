import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export enum BiometricCaptureType {
  FACE = 'face',
  FINGERPRINT = 'fingerprint',
}

@Entity('jupeb_biometric_captures')
@Index('idx_jupeb_bio_captures_registration_id', ['registrationId'])
export class BiometricCaptureEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'registration_id', type: 'uuid' })
  registrationId: string;

  @Column({
    name: 'capture_type',
    type: 'varchar',
    length: 20,
  })
  captureType: BiometricCaptureType;

  @Column({ name: 'file_id', type: 'uuid', nullable: true })
  fileId: string | null;

  @Column({ name: 'external_reference', type: 'varchar', length: 200, nullable: true })
  externalReference: string | null;

  @Column({ name: 'quality_score', type: 'numeric', precision: 5, scale: 2, nullable: true })
  qualityScore: number | null;

  @Column({ name: 'device_metadata', type: 'jsonb', default: {} })
  deviceMetadata: Record<string, unknown>;

  @Column({ name: 'captured_at', type: 'timestamp without time zone' })
  capturedAt: Date;

  @Column({ name: 'replaced_at', type: 'timestamptz', nullable: true })
  replacedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp without time zone' })
  createdAt: Date;
}
