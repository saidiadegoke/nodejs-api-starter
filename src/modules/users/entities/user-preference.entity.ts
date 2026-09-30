import {
  Entity,
  PrimaryColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('user_preferences')
@Index('idx_user_preferences_updated', ['updatedAt'])
export class UserPreferenceEntity {
  @PrimaryColumn({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'push_notifications_enabled', type: 'boolean', default: true })
  pushNotificationsEnabled: boolean;

  @Column({ name: 'biometric_login_enabled', type: 'boolean', default: false })
  biometricLoginEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
