import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsIn,
  IsNumber,
  IsObject,
  IsDateString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateBiometricDto {
  @ApiProperty({
    description: 'Registration UUID to bind this biometric capture to',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsUUID('4')
  @IsNotEmpty()
  registration_id: string;

  @ApiProperty({
    description: 'Biometric capture modality',
    enum: ['face', 'fingerprint'],
    example: 'face',
  })
  @IsString()
  @IsIn(['face', 'fingerprint'])
  capture_type: string;

  @ApiPropertyOptional({
    description: 'File UUID for face selfie uploaded via /files API',
    example: 'e5b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  file_id?: string;

  @ApiPropertyOptional({
    description: 'External capture device reference or token',
    example: 'device_local_auth',
  })
  @IsOptional()
  @IsString()
  external_reference?: string;

  @ApiPropertyOptional({
    description: 'Capture quality assessment score (0-100)',
    example: 95.5,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quality_score?: number;

  @ApiPropertyOptional({
    description: 'Device hardware metadata and sensor diagnostics',
    example: { browser: 'Chrome', platform: 'Android' },
  })
  @IsOptional()
  @IsObject()
  device_metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Device capture timestamp (ISO-8601, defaults to now)',
    example: '2026-09-29T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  captured_at?: string;

  @ApiPropertyOptional({
    description: 'Confirmation flag for on-device fingerprint sensor auth',
    example: true,
  })
  @IsOptional()
  confirmed?: boolean | string | number;
}

export class ReplaceBiometricDto {
  @ApiProperty({
    description: 'Biometric capture modality',
    enum: ['face', 'fingerprint'],
    example: 'face',
  })
  @IsString()
  @IsIn(['face', 'fingerprint'])
  capture_type: string;

  @ApiPropertyOptional({
    description: 'New file UUID for face selfie',
    example: 'e5b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  file_id?: string;

  @ApiPropertyOptional({
    description: 'New external capture device reference or token',
    example: 'device_local_auth',
  })
  @IsOptional()
  @IsString()
  external_reference?: string;

  @ApiPropertyOptional({
    description: 'New capture quality assessment score',
    example: 98.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  quality_score?: number;

  @ApiPropertyOptional({
    description: 'Device hardware metadata and sensor diagnostics',
    example: { browser: 'Chrome', platform: 'Android' },
  })
  @IsOptional()
  @IsObject()
  device_metadata?: Record<string, any>;

  @ApiPropertyOptional({
    description: 'Device capture timestamp',
    example: '2026-09-29T12:00:00.000Z',
  })
  @IsOptional()
  @IsDateString()
  captured_at?: string;

  @ApiPropertyOptional({
    description: 'Confirmation flag for fingerprint replacement',
    example: true,
  })
  @IsOptional()
  confirmed?: boolean | string | number;
}

export class SkipBiometricDto {
  @ApiProperty({
    description: 'Biometric capture modality to skip',
    enum: ['face', 'fingerprint'],
    example: 'fingerprint',
  })
  @IsString()
  @IsIn(['face', 'fingerprint'])
  type: string;

  @ApiPropertyOptional({
    description: 'Reason for skipping biometric capture (e.g. physical disability or device unavailability)',
    example: 'Candidate has severe hand injury; fingerprint exempt approved by Director',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}
