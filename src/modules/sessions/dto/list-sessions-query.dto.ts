import { IsOptional, IsString, IsIn, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListSessionsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiPropertyOptional({
    description: 'Filter by session status',
    enum: ['open', 'closed'],
    example: 'open',
  })
  @IsOptional()
  @IsString()
  @IsIn(['open', 'closed'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Search query across academic_year or year_short',
    example: '2026',
  })
  @IsOptional()
  @IsString()
  q?: string;
}
