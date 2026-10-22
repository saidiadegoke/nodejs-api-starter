import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RegistrationNextStep } from '../../../shared/enums';

export class AuthUserDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'User unique UUID' })
  user_id!: string;

  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  last_name?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Phone number in E.164 format' })
  phone?: string;

  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'Email address' })
  email?: string;

  @ApiPropertyOptional({ example: 'student', description: 'Primary role name' })
  role?: string;

  @ApiProperty({ example: ['student'], description: 'List of assigned role names', type: [String] })
  roles!: string[];

  @ApiProperty({ example: ['profile:read', 'profile:write'], description: 'List of user permissions', type: [String] })
  permissions!: string[];

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/avatar.jpg', description: 'Profile photo URL' })
  profile_photo?: string | null;

  @ApiPropertyOptional({ example: null, description: 'User rating score' })
  rating?: number | null;

  @ApiProperty({ example: true, description: 'Whether email and phone are verified' })
  verified!: boolean;

  @ApiPropertyOptional({ example: 'active', description: 'Account status (active, rejected, inactive, etc.)' })
  status?: string;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z', description: 'Account creation timestamp' })
  created_at!: Date | string;
}

export class AuthRegistrationDto {
  @ApiProperty({ example: 'a12b3c4d-5678-90ef-gh12-34567890abcd', description: 'Registration UUID' })
  id!: string;

  @ApiProperty({ example: 'claimed', description: 'Registration status' })
  status!: string;

  @ApiPropertyOptional({ example: 'Incomplete Documentation', description: 'Reason for status if rejected or flagged' })
  status_reason?: string | null;

  @ApiPropertyOptional({ example: '1234567', description: '7-digit provisional candidate code' })
  provisional_candidate_code?: string;

  @ApiPropertyOptional({ example: '2600112345', description: 'Final assigned JUPEB candidate number' })
  jupeb_candidate_number?: string | null;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z', description: 'Claim timestamp' })
  claimed_at?: Date | string;

  @ApiPropertyOptional({ example: null, description: 'Submission timestamp' })
  submitted_at?: Date | string | null;

  @ApiPropertyOptional({ example: null, description: 'Approval timestamp' })
  approved_at?: Date | string | null;

  @ApiProperty({ example: false, description: 'Whether dashboard access is unlocked' })
  dashboard_unlocked!: boolean;

  @ApiPropertyOptional({
    enum: RegistrationNextStep,
    example: RegistrationNextStep.CONFIRM_SUBJECTS,
    description: 'Computed next wizard step',
  })
  next_step?: RegistrationNextStep | null;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Access Token (1-hour validity)' })
  access_token!: string;

  @ApiProperty({ example: '4a9b2c3d-e5f6-7890-abcd-ef1234567890', description: 'Refresh Token (30-day validity)' })
  refresh_token!: string;

  @ApiProperty({ example: 'Bearer', description: 'Token type' })
  token_type!: string;

  @ApiProperty({ example: 3600, description: 'Access token expiration in seconds' })
  expires_in!: number;

  @ApiProperty({ type: AuthUserDto, description: 'Authenticated user profile details' })
  user!: AuthUserDto;

  @ApiPropertyOptional({ example: null, description: 'Associated university metadata if applicable' })
  university?: any;

  @ApiPropertyOptional({ type: AuthRegistrationDto, description: 'Active candidate registration context if applicable' })
  registration?: AuthRegistrationDto | null;
}

export class RefreshTokenResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'New JWT Access Token' })
  access_token!: string;

  @ApiProperty({ example: 'Bearer', description: 'Token type' })
  token_type!: string;

  @ApiProperty({ example: 3600, description: 'Access token expiration in seconds' })
  expires_in!: number;
}

export class CodeStatusResponseDto {
  @ApiProperty({ example: true, description: 'Whether the code is valid' })
  valid!: boolean;

  @ApiPropertyOptional({ example: 'UNILAG-2026-ABCD', description: 'Institution issued code' })
  code?: string;

  @ApiPropertyOptional({ example: 'code_issued', description: 'Registration status' })
  status?: string;

  @ApiPropertyOptional({ example: { id: 'u1', name: 'University of Lagos', short_name: 'UNILAG' } })
  university?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'code_already_claimed', description: 'Error code if code is invalid or taken' })
  error_code?: string;

  @ApiPropertyOptional({ description: 'Account summary if code is already claimed' })
  account?: Record<string, unknown>;
}

export class RegisterWithCodePreviewResponseDto {
  @ApiProperty({ example: 'a12b3c4d-5678-90ef-gh12-34567890abcd', description: 'Registration ID' })
  registration_id!: string;

  @ApiProperty({ example: 'UNILAG-2026-ABCD', description: 'Code previewed' })
  code!: string;

  @ApiProperty({ example: '1234567', description: 'Assigned provisional candidate code' })
  provisional_candidate_code!: string;

  @ApiProperty({ example: { id: 'u1', name: 'University of Lagos', code: 'UNILAG' } })
  university!: Record<string, unknown>;

  @ApiProperty({ example: { id: 's1', academic_year: '2025/2026' } })
  session!: Record<string, unknown>;

  @ApiProperty({ example: { id: 'sc1', title: 'Mathematics, Physics, Chemistry' } })
  subject_combination!: Record<string, unknown>;
}

export class CompleteRegistrationResponseDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...', description: 'JWT Access Token' })
  access_token!: string;

  @ApiProperty({ example: '4a9b2c3d-e5f6-7890-abcd-ef1234567890', description: 'Refresh Token' })
  refresh_token!: string;

  @ApiProperty({ example: 'Bearer', description: 'Token type' })
  token_type!: string;

  @ApiProperty({ example: 3600, description: 'Expiration in seconds' })
  expires_in!: number;

  @ApiProperty({ type: AuthUserDto })
  user!: AuthUserDto;

  @ApiProperty({ type: AuthRegistrationDto })
  registration!: AuthRegistrationDto;
}

export class OtpIssuedResponseDto {
  @ApiProperty({ example: true, description: 'Whether OTP was successfully dispatched' })
  sent!: boolean;

  @ApiProperty({ example: ['email'], description: 'Channels OTP was sent through', type: [String] })
  channels!: string[];

  @ApiProperty({ example: '2026-09-29T12:10:00.000Z', description: 'OTP expiration timestamp' })
  expires_at!: Date | string;

  @ApiPropertyOptional({ example: 'jo***@example.com', description: 'Masked recipient identifier' })
  masked_recipient?: string;

  @ApiPropertyOptional({ example: '123456', description: 'Raw code in test environment' })
  code?: string;
}

export class VerifyPhoneResponseDto {
  @ApiProperty({ example: true, description: 'Whether verification succeeded' })
  verified!: boolean;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', description: 'Verified user ID' })
  user_id!: string;

  @ApiProperty({ example: 'email', description: 'Channel verified' })
  channel!: string;
}

export class ForgotPasswordResponseDto {
  @ApiProperty({ example: true, description: 'Whether reset process was initiated' })
  reset_initiated!: boolean;

  @ApiProperty({ example: 'token', description: 'Delivery method (token or otp)' })
  delivery!: string;

  @ApiProperty({ example: ['email'], description: 'Channels notified', type: [String] })
  channels!: string[];

  @ApiProperty({ example: '2026-09-29T12:15:00.000Z', description: 'Reset token expiration' })
  expires_at!: string;

  @ApiPropertyOptional({ example: 'jo***@example.com', description: 'Masked recipient' })
  masked_recipient?: string;

  @ApiPropertyOptional({ example: 'raw_test_token_string', description: 'Token returned in test environment' })
  token?: string;
}

export class ResetPasswordResponseDto {
  @ApiProperty({ example: true, description: 'Password reset outcome' })
  success!: boolean;

  @ApiProperty({ example: 'Password reset successfully', description: 'Success message' })
  message!: string;
}

export class JwksKeyDto {
  @ApiProperty({ example: 'RSA', description: 'Key type' })
  kty!: string;

  @ApiProperty({ example: 'sig', description: 'Intended key usage' })
  use!: string;

  @ApiProperty({ example: 'RS256', description: 'Algorithm' })
  alg!: string;

  @ApiProperty({ example: 'crp-sso-key-1', description: 'Key identifier (kid)' })
  kid!: string;

  @ApiProperty({ example: 'AQAB', description: 'RSA public exponent' })
  e!: string;

  @ApiProperty({ example: 'tG9...modulus', description: 'RSA public modulus' })
  n!: string;
}

export class JwksResponseDto {
  @ApiProperty({ type: [JwksKeyDto], description: 'Array of JWKS public keys' })
  keys!: JwksKeyDto[];
}
