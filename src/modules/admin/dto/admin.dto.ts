import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsNotEmpty,
  IsInt,
  Min,
  Max,
  IsBoolean,
  IsArray,
  IsUUID,
  IsEmail,
} from 'class-validator';

// ----------------------------------------------------
// RBAC DTOs
// ----------------------------------------------------

export class CreateRoleDto {
  @ApiProperty({ example: 'exam_officer', description: 'Unique role machine name' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Examination Officer', description: 'Human-readable display name' })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ example: 'Manages candidate exam seatings and score entries.' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: ['candidate.view', 'reports.view'] })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class PatchRoleDto {
  @ApiPropertyOptional({ example: 'Examination Officer' })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ example: 'Updated role description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ example: 'active', enum: ['active', 'inactive'] })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: ['candidate.view', 'reports.view'] })
  @IsOptional()
  @IsArray()
  permissions?: string[];
}

export class CreatePermissionDto {
  @ApiProperty({ example: 'exams.manage' })
  @IsNotEmpty()
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'academic', default: 'general' })
  @IsOptional()
  @IsString()
  module?: string = 'general';

  @ApiPropertyOptional({ example: 'Can manage exam seat allocations.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PatchPermissionDto {
  @ApiPropertyOptional({ example: 'academic' })
  @IsOptional()
  @IsString()
  module?: string;

  @ApiPropertyOptional({ example: 'Updated permission description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class SetUserRolesDto {
  @ApiProperty({ example: ['admin', 'registrar'] })
  @IsArray()
  roles: string[];
}

export class ListRbacQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ example: 'admin' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ example: 'academic' })
  @IsOptional()
  @IsString()
  module?: string;
}

export class RoleResponseDto {
  @ApiProperty({ example: 'r0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  id: string;

  @ApiProperty({ example: 'institution_admin' })
  name: string;

  @ApiPropertyOptional({ example: 'Institution Administrator', nullable: true })
  display_name?: string | null;

  @ApiPropertyOptional({ example: 'Manages institution registrations.', nullable: true })
  description?: string | null;

  @ApiProperty({ example: true })
  is_system: boolean;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiPropertyOptional({ example: ['candidate.view'], type: [String] })
  permissions?: string[];

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;
}

export class PermissionResponseDto {
  @ApiProperty({ example: 'p0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  id: string;

  @ApiProperty({ example: 'reports.view' })
  name: string;

  @ApiProperty({ example: 'reports' })
  module: string;

  @ApiPropertyOptional({ example: 'Can view analytics and reports.', nullable: true })
  description?: string | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;
}

// ----------------------------------------------------
// Admin Users Creation & Stats
// ----------------------------------------------------

export class CreateAdminUserDto {
  @ApiProperty({ example: 'admin@unilag.edu.ng' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'TemporaryP@ss123!' })
  @IsOptional()
  @IsString()
  password?: string;

  @ApiProperty({ example: 'Prof. Olumide' })
  @IsNotEmpty()
  @IsString()
  first_name: string;

  @ApiProperty({ example: 'Bakare' })
  @IsNotEmpty()
  @IsString()
  last_name: string;

  @ApiPropertyOptional({ example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: 'institution_admin', default: 'institution_admin' })
  @IsOptional()
  @IsString()
  role?: string = 'institution_admin';

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  send_welcome_email?: boolean = true;
}

export class AdminUsersStatsResponseDto {
  @ApiProperty({ example: 520 })
  total_users: number;

  @ApiProperty({ example: 495 })
  active_users: number;

  @ApiProperty({ example: 25 })
  inactive_users: number;

  @ApiProperty({ example: 12 })
  verified_emails: number;

  @ApiProperty({ example: 85 })
  institution_admins: number;
}

// ----------------------------------------------------
// Platform Settings
// ----------------------------------------------------

export class UpdatePlatformSettingDto {
  @ApiProperty({ example: 'REGISTRATION_ALLOW_LATE_SUBMISSION' })
  @IsNotEmpty()
  @IsString()
  key: string;

  @ApiProperty({ example: true })
  value: any;

  @ApiPropertyOptional({ example: 'Enable late registration submissions with penalty fees.' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class PlatformSettingResponseDto {
  @ApiProperty({ example: 'REGISTRATION_ALLOW_LATE_SUBMISSION' })
  key: string;

  @ApiProperty({ example: true })
  value: any;

  @ApiPropertyOptional({ example: 'Enable late registration submissions with penalty fees.', nullable: true })
  description?: string | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: Date;
}

// ----------------------------------------------------
// Error & Request Logs
// ----------------------------------------------------

export class ListErrorLogsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ enum: ['all', 'error', 'slow', '5xx', '4xx'], example: 'all' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: 'POST' })
  @IsOptional()
  @IsString()
  method?: string;

  @ApiPropertyOptional({ example: '/api/v1/auth/login' })
  @IsOptional()
  @IsString()
  path?: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00Z' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-09-30T23:59:59Z' })
  @IsOptional()
  @IsString()
  to?: string;
}

export class ErrorLogStatsResponseDto {
  @ApiProperty({ example: 145 })
  total_errors: number;

  @ApiProperty({ example: 12 })
  server_errors: number;

  @ApiProperty({ example: 133 })
  client_errors: number;

  @ApiProperty({ example: 8 })
  slow_requests: number;

  @ApiProperty({ example: 25 })
  errors_today: number;

  @ApiProperty({ example: 2 })
  errors_last_hour: number;

  @ApiProperty({ example: 12500 })
  total_requests: number;
}

export class RequestLogItemDto {
  @ApiProperty({ example: 'l0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  id: string;

  @ApiProperty({ example: 'POST' })
  method: string;

  @ApiProperty({ example: '/api/v1/auth/login' })
  path: string;

  @ApiProperty({ example: 401 })
  status_code: number;

  @ApiProperty({ example: 120 })
  duration_ms: number;

  @ApiPropertyOptional({ example: 'req-12345', nullable: true })
  request_id?: string | null;

  @ApiPropertyOptional({ example: 'u0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11', nullable: true })
  user_id?: string | null;

  @ApiPropertyOptional({ example: '127.0.0.1', nullable: true })
  ip_address?: string | null;

  @ApiPropertyOptional({ example: 'Invalid credentials', nullable: true })
  error_message?: string | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;
}

export class ListErrorLogsResponseDto {
  @ApiProperty({ type: [RequestLogItemDto] })
  entries: RequestLogItemDto[];

  @ApiProperty({ example: 145 })
  total: number;
}

// ----------------------------------------------------
// Database Cleanup & Reset
// ----------------------------------------------------

export class ClearDbDto {
  @ApiPropertyOptional({
    description: 'Filter cleanup to records tied to a specific session UUID',
    example: 's0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Specific tables to clear (or omit to clear all clearable tables)',
    example: ['jupeb_registrations', 'jupeb_biometric_captures'],
  })
  @IsOptional()
  @IsArray()
  tables?: string[];

  @ApiProperty({
    description: 'Safety confirmation string, must be "CONFIRM_DELETE"',
    example: 'CONFIRM_DELETE',
  })
  @IsNotEmpty()
  @IsString()
  confirm: string;
}

export class ClearDbResultDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'Database records cleared successfully' })
  message: string;

  @ApiProperty({ example: { jupeb_registrations: 120, jupeb_biometric_captures: 95 } })
  cleared: Record<string, number>;
}
