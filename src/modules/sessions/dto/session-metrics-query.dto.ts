import { IsOptional, IsUUID } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SessionMetricsQueryDto {
  @ApiPropertyOptional({
    description: 'Explicit session ID (defaults to user viewing session or active session)',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Previous session ID to compute comparison deltas against',
    example: 'a1b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  previous_session_id?: string;
}
