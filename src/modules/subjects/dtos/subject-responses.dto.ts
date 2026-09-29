import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SubjectResponseDto {
  @ApiProperty({ example: '3a436df7-4638-4e8c-a1d2-06927a718b28' })
  id: string;

  @ApiProperty({ example: 'MTH' })
  code: string;

  @ApiProperty({ example: 'Mathematics' })
  name: string;

  @ApiPropertyOptional({ example: 'General syllabus' })
  description: string | null;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiPropertyOptional({ example: 450, description: 'Candidate count offering this subject' })
  enrolled_count?: number;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}

export class SubjectItemDto {
  @ApiProperty({ example: 'e3164a66-1c88-466d-b8d9-21b764cbff31' })
  id: string;

  @ApiProperty({ example: 0 })
  position: number;

  @ApiProperty({ example: '3a436df7-4638-4e8c-a1d2-06927a718b28' })
  subject_id: string;

  @ApiProperty({ example: 'MTH' })
  code: string;

  @ApiProperty({ example: 'Mathematics' })
  name: string;
}

export class SubjectCombinationResponseDto {
  @ApiProperty({ example: '5c010d18-fa0f-488f-a5c6-cf83a8b417c4' })
  id: string;

  @ApiProperty({ example: 'BCP' })
  code: string;

  @ApiProperty({ example: 'Biology, Chemistry, Physics' })
  title: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: true })
  is_global: boolean;

  @ApiPropertyOptional({ example: null })
  university_id: string | null;

  @ApiPropertyOptional({ type: [SubjectItemDto] })
  subject_items?: SubjectItemDto[];

  @ApiPropertyOptional({ example: 120, description: 'Number of enrolled candidates' })
  enrolled_count?: number;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}

export class BulkSubjectOutcomeDto {
  @ApiProperty({ example: 1 })
  row: number;

  @ApiProperty({ example: true })
  ok: boolean;

  @ApiPropertyOptional({ type: SubjectResponseDto })
  data?: SubjectResponseDto;

  @ApiPropertyOptional({ example: 'duplicate' })
  error_code?: string;

  @ApiPropertyOptional({ example: 'Subject already exists' })
  error_message?: string;
}

export class BulkSubjectResultDto {
  @ApiProperty({ example: 10 })
  total: number;

  @ApiProperty({ example: 10 })
  succeeded: number;

  @ApiProperty({ example: 0 })
  failed: number;

  @ApiProperty({ type: [BulkSubjectOutcomeDto] })
  outcomes: BulkSubjectOutcomeDto[];
}
