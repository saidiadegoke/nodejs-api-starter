import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BiometricResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'e5b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ example: 'face', enum: ['face', 'fingerprint'] })
  capture_type: string;

  @ApiPropertyOptional({ example: 'f6b07384-d113-40f4-8a4e-379e4971c260' })
  file_id?: string | null;

  @ApiPropertyOptional({ example: 'device_local_auth' })
  external_reference?: string | null;

  @ApiPropertyOptional({ example: 98.5 })
  quality_score?: number | null;

  @ApiPropertyOptional({ example: { browser: 'Chrome', platform: 'Android' } })
  device_metadata?: Record<string, any>;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  captured_at: string;

  @ApiPropertyOptional({ example: null })
  replaced_at?: string | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: string;
}

export class RegistrationPhotoResponseDto {
  @ApiPropertyOptional({
    description: 'Signed or direct photo URL for the candidate',
    example: 'https://cdn.example.com/photos/candidate-123.jpg',
    nullable: true,
  })
  photo_url: string | null;
}
