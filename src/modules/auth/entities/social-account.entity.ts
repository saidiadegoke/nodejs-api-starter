import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { UserEntity } from '@modules/users';

@Entity('social_accounts')
@Unique(['provider', 'providerUserId'])
export class SocialAccountEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'provider', type: 'varchar', length: 50 })
  provider!: string;

  @Column({ name: 'provider_user_id', type: 'varchar', length: 255 })
  providerUserId!: string;

  @Column({ name: 'provider_email', type: 'varchar', length: 255, nullable: true })
  providerEmail?: string | null;

  @Column({ name: 'provider_data', type: 'jsonb', nullable: true })
  providerData?: Record<string, unknown> | null;

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken?: string | null;

  @Column({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken?: string | null;

  @Column({ name: 'token_expires_at', type: 'timestamp', nullable: true })
  tokenExpiresAt?: Date | null;

  @CreateDateColumn({ name: 'connected_at', type: 'timestamp' })
  connectedAt!: Date;

  @Column({ name: 'last_used_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  lastUsedAt!: Date;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: UserEntity;
}
