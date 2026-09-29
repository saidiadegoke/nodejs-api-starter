import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MetricDeltaDto } from './session-metrics-response.dto';

export class SessionStatsResponseDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiProperty({ example: 1250 })
  total_registrations: number;

  @ApiProperty({
    example: { approved: 1100, pending_documents: 100, pending_institution_review: 50 },
  })
  registrations_by_status: Record<string, number>;

  @ApiProperty({ example: 45 })
  institutions_count: number;

  @ApiProperty({ example: 18 })
  subject_combinations_count: number;

  @ApiProperty({ example: 980 })
  candidates_with_biometrics: number;

  @ApiProperty({ example: 270 })
  candidates_without_biometrics: number;

  @ApiPropertyOptional({ example: 'a1b07384-d113-40f4-8a4e-379e4971c260' })
  previous_session_id?: string;

  @ApiPropertyOptional({
    description: 'Deltas keyed by metric name',
    example: {
      total_registrations: { value: 1250, previous: 1000, delta_pct: 25.0, direction: 'up' },
    },
  })
  deltas?: Record<string, MetricDeltaDto>;
}
