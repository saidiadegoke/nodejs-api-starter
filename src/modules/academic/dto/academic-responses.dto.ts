import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegistrationResultItemResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  course_id: string;

  @ApiPropertyOptional({ example: 'MTH001' })
  course_code?: string;

  @ApiPropertyOptional({ example: 'General Mathematics I' })
  course_title?: string;

  @ApiProperty({ example: 'A' })
  grade: string;

  @ApiProperty({ example: true })
  plus_one_awarded: boolean;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  entered_at?: string;
}

export class AggregateScoreDto {
  @ApiProperty({ example: 3 })
  passed_courses_count: number;

  @ApiProperty({ example: 0 })
  failed_courses_count: number;

  @ApiProperty({ example: 3 })
  plus_one_total: number;
}

export class ScoreSnapshotDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 3 })
  passed_courses_count: number;

  @ApiProperty({ example: 0 })
  failed_courses_count: number;

  @ApiProperty({ example: 3 })
  plus_one_total: number;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  computed_at?: string;
}

export class ScoreBreakdownResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ type: [RegistrationResultItemResponseDto] })
  results: RegistrationResultItemResponseDto[];

  @ApiProperty({ type: AggregateScoreDto })
  aggregate: AggregateScoreDto;

  @ApiPropertyOptional({ type: ScoreSnapshotDto })
  snapshot?: ScoreSnapshotDto | null;
}

export class ResultEntryResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiProperty({ example: 'waec' })
  source: string;

  @ApiProperty({ example: 1 })
  sitting: number;

  @ApiProperty({ example: 0 })
  serial: number;

  @ApiProperty({ example: 'MATHEMATICS' })
  subject: string;

  @ApiProperty({ example: 'A1' })
  grade: string;

  @ApiPropertyOptional({ example: 'A' })
  grade_normalized?: string | null;

  @ApiPropertyOptional({ example: 85 })
  score?: number | null;

  @ApiProperty({ example: 'manual' })
  origin: string;

  @ApiPropertyOptional({ example: 'ocr-job-uuid' })
  ocr_job_id?: string | null;
}

export class ResultEntriesGroupDto {
  @ApiProperty({ example: 'waec' })
  source: string;

  @ApiProperty({ example: 1 })
  sitting: number;

  @ApiProperty({ type: [ResultEntryResponseDto] })
  subjects: ResultEntryResponseDto[];
}

export class ResultEntriesListResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  registration_id: string;

  @ApiPropertyOptional({ example: 5 })
  upserted_count?: number;

  @ApiPropertyOptional({ type: [ResultEntryResponseDto] })
  entries?: ResultEntryResponseDto[];

  @ApiPropertyOptional({ type: [ResultEntriesGroupDto] })
  groups?: ResultEntriesGroupDto[];
}

export class ReleaseToInstitutionsResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiProperty({ example: '2025/2026' })
  academic_year: string;

  @ApiProperty({ example: true })
  results_released_to_institutions: boolean;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  results_released_at?: string;

  @ApiPropertyOptional({ example: 'user-uuid' })
  released_by?: string;
}

export class ReleaseToStudentsResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiProperty({ example: '2025/2026' })
  academic_year: string;

  @ApiProperty({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  university_id: string;

  @ApiProperty({ example: true })
  release_all: boolean;

  @ApiProperty({ example: 120 })
  released_count: number;

  @ApiProperty({ example: true })
  results_released_to_students: boolean;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  students_results_released_at?: string;
}

export class RequestReleaseOtpResponseDto {
  @ApiProperty({ example: true })
  success: boolean;

  @ApiProperty({ example: 'OTP authorization code sent successfully' })
  message: string;

  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  otp_id: string;

  @ApiProperty({ example: ['email'] })
  channels: string[];

  @ApiPropertyOptional({ example: '2026-10-22T13:30:00.000Z' })
  expires_at?: Date | string;

  @ApiPropertyOptional({
    description: 'Dev/test only raw OTP code when environment allows',
    example: '123456',
  })
  code?: string;
}
