import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class MetricDeltaDto {
  @ApiProperty({ example: 1250 })
  value: number;

  @ApiProperty({ example: 1000 })
  previous: number;

  @ApiPropertyOptional({ example: 25.0, nullable: true })
  delta_pct: number | null;

  @ApiProperty({ example: 'up', enum: ['up', 'down', 'flat', 'new'] })
  direction: string;
}

export class SessionMetricsDataDto {
  @ApiPropertyOptional({ example: null, nullable: true })
  exams: number | null;

  @ApiProperty({ example: 45 })
  institutions: number;

  @ApiProperty({ example: 1250 })
  total_candidates: number;

  @ApiProperty({ example: 1100 })
  current_candidates_enrolled: number;

  @ApiProperty({ example: 980 })
  candidates_with_biometrics: number;
}

export class SessionHeaderDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: '2026/2027' })
  label: string;

  @ApiProperty({ example: 'open', enum: ['open', 'closed'] })
  status: string;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  opens_at?: string | null;

  @ApiPropertyOptional({ example: '2027-08-31T23:59:59.000Z' })
  closes_at?: string | null;
}

export class ComparedToDto {
  @ApiProperty({ example: 'a1b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiPropertyOptional({ example: '2025/2026' })
  label?: string | null;
}

export class SessionMetricsResponseDto {
  @ApiPropertyOptional({ type: SessionHeaderDto, nullable: true })
  session: SessionHeaderDto | null;

  @ApiProperty({ type: SessionMetricsDataDto })
  metrics: SessionMetricsDataDto;

  @ApiPropertyOptional({ type: ComparedToDto })
  compared_to?: ComparedToDto;

  @ApiPropertyOptional({
    description: 'Deltas keyed by metric name',
    example: {
      institutions: { value: 45, previous: 40, delta_pct: 12.5, direction: 'up' },
      total_candidates: { value: 1250, previous: 1000, delta_pct: 25.0, direction: 'up' },
    },
  })
  deltas?: Record<string, MetricDeltaDto>;
}
