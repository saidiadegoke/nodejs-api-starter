import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '@modules/users';

@Entity('user_sessions')
export class UserSessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'refresh_token_hash', type: 'varchar', length: 255 })
  refreshTokenHash!: string;

  @Column({ name: 'device_info', type: 'jsonb', nullable: true })
  deviceInfo?: Record<string, unknown> | null;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt!: Date;

  @Column({ name: 'is_revoked', type: 'boolean', default: false })
  isRevoked!: boolean;

  @Column({ name: 'revoked_at', type: 'timestamp', nullable: true })
  revokedAt?: Date | null;

  @Column({ name: 'revoked_reason', type: 'varchar', length: 100, nullable: true })
  revokedReason?: string | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
