import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetricValueDto {
  @ApiProperty({ example: 1250, description: 'Current metric value' })
  value: number;

  @ApiPropertyOptional({ example: 12.5, description: 'Percentage change vs previous session', nullable: true })
  delta_pct?: number | null;
}

export class RegistrationLockSummaryDto {
  @ApiProperty({ example: false, description: 'Whether registration is globally locked' })
  locked: boolean;

  @ApiPropertyOptional({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', nullable: true })
  session_id?: string | null;

  @ApiPropertyOptional({ example: '2025/2026', nullable: true })
  label?: string | null;
}

export class SessionComparisonLabelDto {
  @ApiProperty({ example: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33' })
  session_id: string;

  @ApiProperty({ example: '2024/2025' })
  label: string;
}

export class DashboardStatCardsResponseDto {
  @ApiProperty({ type: MetricValueDto })
  institutions_onboarded: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  active_institutions: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  inactive_institutions: MetricValueDto;

  @ApiProperty({ example: false })
  registration_locked: boolean;

  @ApiProperty({ type: RegistrationLockSummaryDto })
  registration_lock: RegistrationLockSummaryDto;

  @ApiProperty({ type: MetricValueDto })
  total_registered: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  approved: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  pending: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  with_biometrics: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  without_biometrics: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  total_subjects: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  total_subject_combinations: MetricValueDto;

  @ApiProperty({ type: MetricValueDto })
  inactive_subjects: MetricValueDto;

  @ApiPropertyOptional({ type: SessionComparisonLabelDto, nullable: true })
  compared_to?: SessionComparisonLabelDto | null;
}

export class SessionBriefDto {
  @ApiProperty({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  id: string;

  @ApiProperty({ example: '2025/2026' })
  label: string;

  @ApiProperty({ example: 'open' })
  status: string;
}

export class DashboardQuickStatsResponseDto {
  @ApiProperty({ example: 4500, description: 'Total unique student registrations' })
  total_students: number;

  @ApiProperty({ example: 85, description: 'Total active affiliated institutions' })
  institutions_count: number;

  @ApiPropertyOptional({ type: SessionBriefDto, nullable: true })
  active_session?: SessionBriefDto | null;

  @ApiPropertyOptional({ type: SessionBriefDto, nullable: true })
  effective_session?: SessionBriefDto | null;
}

export class DashboardStudentsStatusResponseDto {
  @ApiProperty({ example: 3800, description: 'Approved registrations count' })
  approved: number;

  @ApiProperty({ example: 120, description: 'Rejected registrations count' })
  rejected: number;

  @ApiProperty({ example: 580, description: 'Pending approval registrations count' })
  pending: number;
}

export class TrendPointDto {
  @ApiProperty({ example: 9, description: 'Month (1-12)' })
  month: number;

  @ApiPropertyOptional({ example: 2026, description: 'Year' })
  year?: number;

  @ApiProperty({ example: 420, description: 'Number of registrations' })
  count: number;
}

export class TrendSeriesDto {
  @ApiProperty({ example: 'current' })
  key: string;

  @ApiPropertyOptional({ example: 2026 })
  year?: number;

  @ApiProperty({ type: [TrendPointDto] })
  points: TrendPointDto[];
}

export class DashboardRegistrationTrendsResponseDto {
  @ApiPropertyOptional({ example: 2026, nullable: true })
  year?: number | null;

  @ApiPropertyOptional({ description: 'Session context if session-scoped', nullable: true })
  session?: any;

  @ApiProperty({ type: [TrendSeriesDto] })
  series: TrendSeriesDto[];
}

export class InstitutionDistributionSliceDto {
  @ApiProperty({ example: 'federal', description: 'Institution type: federal | state | private | unspecified' })
  type: string;

  @ApiProperty({ example: 45 })
  count: number;

  @ApiProperty({ example: 52.9, description: 'Percentage share of total institutions' })
  pct: number;
}

export class InstitutionDistributionResponseDto {
  @ApiProperty({ example: 85 })
  total: number;

  @ApiProperty({ type: [InstitutionDistributionSliceDto] })
  slices: InstitutionDistributionSliceDto[];
}

export class InstitutionTrendsResponseDto {
  @ApiProperty({ example: 2026 })
  year: number;

  @ApiProperty({ type: [TrendSeriesDto] })
  series: TrendSeriesDto[];
}

export class SubjectItemSummaryDto {
  @ApiProperty({ example: 'PHY' })
  code: string;

  @ApiProperty({ example: 'Physics' })
  name: string;
}

export class SubjectCombinationSliceDto {
  @ApiProperty({ example: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  subject_combination_id: string;

  @ApiProperty({ example: 'PCM' })
  code: string;

  @ApiProperty({ example: 'Physics / Chemistry / Mathematics' })
  title: string;

  @ApiProperty({ type: [SubjectItemSummaryDto] })
  subjects: SubjectItemSummaryDto[];

  @ApiProperty({ example: 850 })
  count: number;

  @ApiProperty({ example: 34.5 })
  pct: number;
}

export class SubjectCombinationDistributionResponseDto {
  @ApiPropertyOptional({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22', nullable: true })
  session_id?: string | null;

  @ApiProperty({ example: 2460 })
  total: number;

  @ApiProperty({ type: [SubjectCombinationSliceDto] })
  slices: SubjectCombinationSliceDto[];
}

export class SubjectEnrollmentItemDto {
  @ApiProperty({ example: 's1eebc99-9c0b-4ef8-bb6d-6bb9bd380a55' })
  subject_id: string;

  @ApiProperty({ example: 'MTH' })
  code: string;

  @ApiProperty({ example: 'Mathematics' })
  name: string;

  @ApiProperty({ example: 1940 })
  count: number;
}

export class SessionTimelineResponseDto {
  @ApiProperty({ example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22' })
  session_id: string;

  @ApiProperty({ example: '2025/2026' })
  academic_year: string;

  @ApiProperty({ example: '25/26' })
  year_short: string;

  @ApiProperty({ example: 'open' })
  status: string;

  @ApiPropertyOptional({ example: '2025-09-01T00:00:00Z', nullable: true })
  opens_at?: Date | null;

  @ApiPropertyOptional({ example: '2026-08-31T23:59:59Z', nullable: true })
  closes_at?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  candidate_info_cutoff_at?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  profile_update_cutoff_at?: Date | null;

  @ApiPropertyOptional({ nullable: true })
  ca_cutoff_at?: Date | null;

  @ApiProperty({ example: '2026-09-29T16:00:00.000Z' })
  now: string;

  @ApiProperty({ example: true })
  within_window: boolean;
}

export class SubjectCombinationBriefDto {
  @ApiProperty({ example: 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a44' })
  id: string;

  @ApiProperty({ example: 'PCM' })
  code: string;
}

export class RecentRegistrationItemDto {
  @ApiProperty({ example: 'r1eebc99-9c0b-4ef8-bb6d-6bb9bd380a66' })
  registration_id: string;

  @ApiPropertyOptional({ example: 'UNILAG/2026/00123', nullable: true })
  candidate_id?: string | null;

  @ApiPropertyOptional({ example: 'Chukwuma Adeyemi', nullable: true })
  name?: string | null;

  @ApiPropertyOptional({ example: 'chukwuma@example.com', nullable: true })
  email?: string | null;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/123.jpg', nullable: true })
  avatar_url?: string | null;

  @ApiPropertyOptional({ type: SubjectCombinationBriefDto, nullable: true })
  subject_combination?: SubjectCombinationBriefDto | null;

  @ApiProperty({ example: true })
  biometric_captured: boolean;

  @ApiProperty({ example: 'approved' })
  status: string;

  @ApiProperty({ example: 'approved' })
  raw_status: string;

  @ApiPropertyOptional({ nullable: true })
  submitted_at?: Date | null;

  @ApiProperty({ example: '2026-09-29T12:00:00.000Z' })
  created_at: Date;
}

export class StudentSummaryMetricsDto {
  @ApiProperty({ example: 92.5 })
  attendance_percent: number;

  @ApiProperty({ example: 78.4 })
  average_score_percent: number;

  @ApiProperty({ example: 3 })
  subjects_count: number;

  @ApiPropertyOptional({ example: 'A', nullable: true })
  overall_grade?: string | null;
}

export class StudentHomeResponseDto {
  @ApiProperty({ type: StudentSummaryMetricsDto })
  summary: StudentSummaryMetricsDto;

  @ApiProperty({ type: [Object], example: [] })
  todays_classes: any[];

  @ApiPropertyOptional({ nullable: true })
  attendance_chart?: any;

  @ApiProperty({ example: 2 })
  unread_notifications_count: number;
}
