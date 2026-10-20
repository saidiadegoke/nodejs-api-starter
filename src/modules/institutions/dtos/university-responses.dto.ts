import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class InstitutionAdminSummaryDto {
  @ApiProperty({ example: '85bb4a05-3e28-4e1b-90f7-111111111111' })
  user_id: string;

  @ApiProperty({ example: 'admin@unilag.edu.ng' })
  email: string;

  @ApiPropertyOptional({ example: 'John' })
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  last_name?: string;
}

export class UniversityResponseDto {
  @ApiProperty({ example: '7d3b2075-816a-4d22-b5e1-0cf24a66a7b7' })
  id: string;

  @ApiProperty({ example: '001' })
  code: string;

  @ApiProperty({ example: 'University of Lagos' })
  name: string;

  @ApiPropertyOptional({ example: 'UNILAG' })
  short_name: string | null;

  @ApiProperty({ example: 'UNILAG' })
  jupeb_prefix: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: { state: 'Lagos' } })
  metadata: Record<string, any>;

  @ApiPropertyOptional({ example: 'federal' })
  university_type: string | null;

  @ApiPropertyOptional({ example: 'admin@unilag.edu.ng' })
  email: string | null;

  @ApiPropertyOptional({ example: 'Akoka, Yaba, Lagos' })
  address: string | null;

  @ApiPropertyOptional({ example: '+2348012345678' })
  phone: string | null;

  @ApiPropertyOptional({ example: 500 })
  expected_candidate_count: number | null;

  @ApiPropertyOptional({ example: 'Premier federal institution' })
  description: string | null;

  @ApiPropertyOptional({ example: 342, description: 'Number of candidates enrolled in current session' })
  enrolled_count?: number;

  @ApiPropertyOptional({ example: false, description: 'Whether registration is locked for this institution in the current/effective session' })
  locked?: boolean;

  @ApiPropertyOptional({ example: false, description: 'Alias for locked' })
  is_locked?: boolean;

  @ApiPropertyOptional({ example: 'Quota reached', description: 'Reason for institution registration lock' })
  lock_reason?: string | null;

  @ApiPropertyOptional({ example: '2026-01-15T10:00:00.000Z', description: 'When the lock was applied' })
  locked_at?: Date | string | null;

  @ApiPropertyOptional({ type: InstitutionAdminSummaryDto })
  institution_admin?: InstitutionAdminSummaryDto;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}

export class BulkUploadOutcomeDto {
  @ApiProperty({ example: 1 })
  row: number;

  @ApiProperty({ example: true })
  ok: boolean;

  @ApiPropertyOptional({ type: UniversityResponseDto })
  data?: UniversityResponseDto;

  @ApiPropertyOptional({ example: 'duplicate' })
  error_code?: string;

  @ApiPropertyOptional({ example: 'University with this code already exists' })
  error_message?: string;
}

export class BulkUploadResultDto {
  @ApiProperty({ example: 50 })
  total: number;

  @ApiProperty({ example: 48 })
  succeeded: number;

  @ApiProperty({ example: 2 })
  failed: number;

  @ApiProperty({ type: [BulkUploadOutcomeDto] })
  outcomes: BulkUploadOutcomeDto[];
}
