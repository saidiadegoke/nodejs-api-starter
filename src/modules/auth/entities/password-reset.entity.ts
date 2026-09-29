import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { UserEntity } from '@modules/users';

@Entity('password_resets')
export class PasswordResetEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'varchar', length: 255 })
  tokenHash!: string;

  @Column({ name: 'email', type: 'varchar', length: 255, nullable: true })
  email?: string | null;

  @Column({ name: 'phone', type: 'varchar', length: 40, nullable: true })
  phone?: string | null;

  @Column({ name: 'method', type: 'varchar', length: 10 })
  method!: string;

  @Column({ name: 'kind', type: 'varchar', length: 10, default: 'token' })
  kind!: string;

  @Column({ name: 'attempt_count', type: 'int', default: 0 })
  attemptCount!: number;

  @Column({ name: 'ip_address', type: 'inet', nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ name: 'expires_at', type: 'timestamp' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamp', nullable: true })
  usedAt?: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
