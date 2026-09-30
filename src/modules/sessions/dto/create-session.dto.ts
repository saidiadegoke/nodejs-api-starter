import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  Max,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateSessionDto {
  @ApiProperty({
    description: 'Academic year in YYYY/YYYY format',
    example: '2026/2027',
  })
  @IsString()
  @IsNotEmpty()
  academic_year: string;

  @ApiProperty({
    description: 'Two-character short year (last two digits of ending year)',
    example: '27',
  })
  @IsString()
  @Length(2, 2)
  year_short: string;

  @ApiProperty({
    description: 'Session opening timestamp (ISO-8601)',
    example: '2026-09-01T00:00:00.000Z',
  })
  @IsDateString()
  opens_at: string;

  @ApiProperty({
    description: 'Session closing timestamp (ISO-8601)',
    example: '2027-08-31T23:59:59.000Z',
  })
  @IsDateString()
  closes_at: string;

  @ApiPropertyOptional({
    description: 'Deadline for student registration submission',
    example: '2027-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  student_submission_deadline?: string | null;

  @ApiPropertyOptional({
    description: 'Deadline for institution registration approval',
    example: '2027-07-15T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  institution_approval_deadline?: string | null;

  @ApiPropertyOptional({
    description: 'Candidate information cutoff timestamp',
    example: '2027-06-30T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  candidate_info_cutoff_at?: string | null;

  @ApiPropertyOptional({
    description: 'Profile update cutoff timestamp',
    example: '2027-07-10T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  profile_update_cutoff_at?: string | null;

  @ApiPropertyOptional({
    description: 'Continuous assessment score cutoff timestamp',
    example: '2027-07-20T23:59:59.000Z',
  })
  @IsOptional()
  @IsDateString()
  ca_cutoff_at?: string | null;

  @ApiPropertyOptional({
    description: 'Maximum CA score allowed (0-100)',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  max_ca_score?: number | null;

  @ApiPropertyOptional({
    description: 'Per-candidate registration fee amount',
    example: 15000.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  registration_fee_amount?: number | null;

  @ApiPropertyOptional({
    description: '3-letter currency code for registration fee',
    example: 'NGN',
    default: 'NGN',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  registration_fee_currency?: string | null;

  @ApiPropertyOptional({
    description: 'Annual affiliation fee for existing centers',
    example: 250000.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  affiliation_fee_existing?: number | null;

  @ApiPropertyOptional({
    description: 'Affiliation fee for newly approved institutions',
    example: 500000.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  affiliation_fee_new?: number | null;

  @ApiPropertyOptional({
    description: 'Examination fee per candidate',
    example: 25000.0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  exam_fee_per_candidate?: number | null;

  @ApiPropertyOptional({
    description: 'Session administrative notes or remarks',
    example: '2026/2027 Annual Session with standard fee schedule',
  })
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Alias for notes',
    example: '2026/2027 Annual Session',
  })
  @IsOptional()
  @IsString()
  description?: string | null;
}
