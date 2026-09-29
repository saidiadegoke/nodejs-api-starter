import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '@modules/users';

@Entity('otp_codes')
export class OtpCodeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash!: string;

  @Column({ name: 'channel', type: 'varchar', length: 10 })
  channel!: string;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt?: Date | null;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
