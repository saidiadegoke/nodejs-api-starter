import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class NinVerificationResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: '8901' })
  nin_last4: string;

  @ApiProperty({ example: 'speedysms' })
  provider: string;

  @ApiPropertyOptional({ example: 'spd-lookup-12345' })
  provider_reference?: string | null;

  @ApiProperty({ example: 'verified', enum: ['verified', 'failed', 'pending'] })
  status: string;

  @ApiPropertyOptional({
    example: {
      first_name: 'Adewale',
      last_name: 'Adeyemi',
      middle_name: 'Oluwaseun',
      gender: 'male',
      date_of_birth: '2004-05-15',
      phone: '+2348012345678',
      state_of_origin: 'Lagos State',
      lga: 'Ikeja',
      photo_url: 'https://cdn.example.com/photos/123.jpg',
    },
  })
  response_payload?: Record<string, any>;

  @ApiPropertyOptional({ example: null })
  error?: Record<string, any> | null;

  @ApiPropertyOptional({ example: null })
  error_message?: string | null;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  verified_at?: string | null;

  @ApiPropertyOptional({ example: '2026-09-29T12:05:00.000Z' })
  retry_after?: string | null;

  @ApiPropertyOptional({ example: { university_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' } })
  intake_payload?: Record<string, any> | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: string;
}
