import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: '2026/2027' })
  academic_year: string;

  @ApiProperty({ example: '27' })
  year_short: string;

  @ApiProperty({ example: 'open', enum: ['open', 'closed'] })
  status: string;

  @ApiProperty({ example: '2026-09-01T00:00:00.000Z' })
  opens_at: string;

  @ApiProperty({ example: '2027-08-31T23:59:59.000Z' })
  closes_at: string;

  @ApiPropertyOptional({ example: '2027-06-30T23:59:59.000Z' })
  student_submission_deadline?: string | null;

  @ApiPropertyOptional({ example: '2027-07-15T23:59:59.000Z' })
  institution_approval_deadline?: string | null;

  @ApiProperty({ example: false })
  registration_locked: boolean;

  @ApiPropertyOptional({ example: null })
  final_numbers_generated_at?: string | null;

  @ApiPropertyOptional({ example: 'Annual 2026/2027 session' })
  notes?: string | null;

  @ApiPropertyOptional({ example: '15000.00' })
  registration_fee_amount?: number | null;

  @ApiPropertyOptional({ example: 'NGN' })
  registration_fee_currency?: string | null;

  @ApiPropertyOptional({ example: '2027-06-30T23:59:59.000Z' })
  candidate_info_cutoff_at?: string | null;

  @ApiPropertyOptional({ example: '2027-07-10T23:59:59.000Z' })
  profile_update_cutoff_at?: string | null;

  @ApiPropertyOptional({ example: '2027-07-20T23:59:59.000Z' })
  ca_cutoff_at?: string | null;

  @ApiPropertyOptional({ example: 30 })
  max_ca_score?: number | null;

  @ApiPropertyOptional({ example: '250000.00' })
  affiliation_fee_existing?: number | null;

  @ApiPropertyOptional({ example: '500000.00' })
  affiliation_fee_new?: number | null;

  @ApiPropertyOptional({ example: '25000.00' })
  exam_fee_per_candidate?: number | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: string;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  updated_at: string;
}
