import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('api_keys')
@Index('idx_api_keys_user_id', ['userId'])
@Index('idx_api_keys_status', ['status'])
export class ApiKeyEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'name', type: 'varchar', length: 100 })
  name: string;

  @Column({ name: 'key_prefix', type: 'varchar', length: 32 })
  keyPrefix: string;

  @Column({ name: 'key_hash', type: 'varchar', length: 128, unique: true })
  keyHash: string;

  @Column({ name: 'status', type: 'varchar', length: 20, default: 'active' })
  status: string;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
