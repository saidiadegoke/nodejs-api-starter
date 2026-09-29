import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UniversityLockItemDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  university_id: string;

  @ApiProperty({ example: 'University of Lagos' })
  university_name: string;

  @ApiProperty({ example: 'UNILAG' })
  university_code: string;

  @ApiPropertyOptional({ example: 'UNILAG' })
  university_short_name?: string | null;

  @ApiProperty({ example: true })
  locked: boolean;

  @ApiPropertyOptional({ example: 'Pending compliance audit' })
  reason?: string | null;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  locked_at?: string | null;

  @ApiPropertyOptional({ example: 'e4b07384-d113-40f4-8a4e-379e4971c260' })
  locked_by?: string | null;

  @ApiPropertyOptional({ example: 'John Doe' })
  locked_by_name?: string | null;

  @ApiPropertyOptional({ example: 'johndoe@example.com' })
  locked_by_email?: string | null;

  @ApiPropertyOptional({ example: '2026-09-29T12:00:00.000Z' })
  updated_at?: string | null;
}

export class SelectiveLockResultDto {
  @ApiProperty({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  session_id: string;

  @ApiProperty({ example: true })
  locked: boolean;

  @ApiPropertyOptional({ example: 'Pending compliance audit' })
  reason?: string | null;

  @ApiProperty({ example: ['d3b07384-d113-40f4-8a4e-379e4971c260'] })
  university_ids: string[];

  @ApiProperty({ example: 1 })
  updated_count: number;

  @ApiProperty({ type: [UniversityLockItemDto] })
  items: UniversityLockItemDto[];
}
