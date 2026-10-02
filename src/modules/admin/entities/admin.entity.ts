import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('roles')
export class RoleEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 150, nullable: true })
  displayName?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy?: string | null;

  @Column({ name: 'owner_jupeb_university_id', type: 'uuid', nullable: true })
  ownerJupebUniversityId?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('permissions')
export class PermissionEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  resource?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  action?: string | null;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('role_permissions')
export class RolePermissionEntity {
  @Column({ name: 'role_id', type: 'uuid', primary: true })
  roleId: string;

  @Column({ name: 'permission_id', type: 'uuid', primary: true })
  permissionId: string;
}

@Entity('user_roles')
export class UserRoleEntity {
  @Column({ name: 'user_id', type: 'uuid', primary: true })
  userId: string;

  @Column({ name: 'role_id', type: 'uuid', primary: true })
  roleId: string;

  @Column({ name: 'assigned_by', type: 'uuid', nullable: true })
  assignedBy?: string | null;

  @CreateDateColumn({ name: 'assigned_at', type: 'timestamptz' })
  assignedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt?: Date | null;
}

@Entity('platform_settings')
export class PlatformSettingEntity {
  @Column({ type: 'varchar', length: 100, primary: true })
  key: string;

  @Column({ type: 'jsonb', nullable: true })
  value: any;

  @Column({ type: 'text', nullable: true })
  description?: string | null;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy?: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}

@Entity('request_logs')
export class RequestLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 10 })
  method: string;

  @Column({ type: 'varchar', length: 500 })
  path: string;

  @Column({ name: 'status_code', type: 'int' })
  statusCode: number;

  @Column({ name: 'duration_ms', type: 'int' })
  durationMs: number;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId?: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId?: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 50, nullable: true })
  ipAddress?: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string | null;

  @Column({ name: 'request_body', type: 'jsonb', nullable: true })
  requestBody?: any;

  @Column({ name: 'request_query', type: 'jsonb', nullable: true })
  requestQuery?: any;

  @Column({ name: 'response_body', type: 'jsonb', nullable: true })
  responseBody?: any;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string | null;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack?: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
