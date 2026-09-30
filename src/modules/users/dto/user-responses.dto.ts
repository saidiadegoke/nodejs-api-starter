import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UserProfileResponseDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'User unique UUID' })
  id!: string;

  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'User email' })
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'User phone' })
  phone?: string;

  @ApiProperty({ example: 'active', description: 'Account status' })
  status!: string;

  @ApiProperty({ example: true, description: 'Email verified status' })
  email_verified!: boolean;

  @ApiProperty({ example: true, description: 'Phone verified status' })
  phone_verified!: boolean;

  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  last_name?: string;

  @ApiPropertyOptional({ example: 'Johnny', description: 'Middle name' })
  middle_name?: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Display name' })
  display_name?: string;

  @ApiPropertyOptional({ example: 'male', description: 'Gender' })
  gender?: string;

  @ApiPropertyOptional({ example: '2000-01-01', description: 'Date of birth' })
  date_of_birth?: string;

  @ApiPropertyOptional({ example: '123 Campus Way, Lagos', description: 'Residential address' })
  residential_address?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/avatar.jpg', description: 'Profile photo URL' })
  profile_photo_url?: string;

  @ApiProperty({ example: ['student'], description: 'Assigned roles', type: [String] })
  roles!: string[];

  @ApiProperty({ example: ['profile:read', 'profile:write'], description: 'Permissions list', type: [String] })
  permissions!: string[];

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z', description: 'Account creation date' })
  created_at!: Date | string;
}

export class UserPreferencesResponseDto {
  @ApiProperty({ example: true, description: 'Email notifications preference' })
  email_notifications!: boolean;

  @ApiProperty({ example: true, description: 'SMS notifications preference' })
  sms_notifications!: boolean;

  @ApiProperty({ example: true, description: 'Push notifications preference' })
  push_notifications!: boolean;

  @ApiProperty({ example: 'light', description: 'Theme preference (light / dark)' })
  theme!: string;

  @ApiProperty({ example: 'en', description: 'Language code' })
  language!: string;

  @ApiPropertyOptional({ example: {}, description: 'Extra preference configuration' })
  extra?: Record<string, unknown>;
}

export class UserActivityItemDto {
  @ApiProperty({ example: 'b12c3d4e-5678-90ab-cdef-1234567890ab', description: 'Activity event ID' })
  id!: string;

  @ApiProperty({ example: 'auth:login', description: 'Action key' })
  action!: string;

  @ApiPropertyOptional({ example: 'User login from 127.0.0.1', description: 'Activity description' })
  description?: string;

  @ApiPropertyOptional({ example: '127.0.0.1', description: 'IP address' })
  ip_address?: string;

  @ApiPropertyOptional({ example: 'Mozilla/5.0...', description: 'User agent' })
  user_agent?: string;

  @ApiPropertyOptional({ example: {}, description: 'Event metadata' })
  metadata?: Record<string, unknown>;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z', description: 'Event timestamp' })
  created_at!: Date | string;
}

export class UserActivityListResponseDto {
  @ApiProperty({ type: [UserActivityItemDto], description: 'List of activity records' })
  items!: UserActivityItemDto[];

  @ApiProperty({ example: 100, description: 'Total matching items' })
  total!: number;

  @ApiProperty({ example: 1, description: 'Current page number' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Page size' })
  limit!: number;

  @ApiProperty({ example: 5, description: 'Total pages' })
  total_pages!: number;
}
