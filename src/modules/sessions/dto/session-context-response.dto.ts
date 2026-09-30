import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SessionSummaryDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  id: string;

  @ApiProperty({ example: '2026/2027' })
  label: string;

  @ApiProperty({ example: 'open', enum: ['open', 'closed'] })
  status: string;

  @ApiProperty({ example: false })
  registration_locked: boolean;

  @ApiProperty({ example: false })
  session_registration_locked: boolean;

  @ApiProperty({ example: false })
  institution_registration_locked: boolean;

  @ApiPropertyOptional({ example: '2026-09-01T00:00:00.000Z' })
  opens_at?: string | null;

  @ApiPropertyOptional({ example: '2027-08-31T23:59:59.000Z' })
  closes_at?: string | null;

  @ApiPropertyOptional({ example: '2027-06-30T23:59:59.000Z' })
  candidate_info_cutoff_at?: string | null;

  @ApiPropertyOptional({ example: '2027-07-10T23:59:59.000Z' })
  profile_update_cutoff_at?: string | null;

  @ApiPropertyOptional({ example: '2027-07-20T23:59:59.000Z' })
  ca_cutoff_at?: string | null;

  @ApiProperty({ example: true })
  window_open: boolean;

  @ApiProperty({ example: false })
  candidate_info_closed: boolean;

  @ApiProperty({ example: false })
  profile_update_closed: boolean;

  @ApiProperty({ example: false })
  ca_closed: boolean;
}

export class SessionContextResponseDto {
  @ApiPropertyOptional({ type: SessionSummaryDto, nullable: true })
  active_session: SessionSummaryDto | null;

  @ApiPropertyOptional({ type: SessionSummaryDto, nullable: true })
  viewing_session: SessionSummaryDto | null;

  @ApiPropertyOptional({ type: SessionSummaryDto, nullable: true })
  effective_session: SessionSummaryDto | null;
}
