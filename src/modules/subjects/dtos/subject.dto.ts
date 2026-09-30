import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubjectDto {
  @ApiProperty({ example: 'MTH', description: 'Unique subject code (max 20 chars)' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Mathematics', description: 'Subject display name' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({ example: 'General and advanced mathematics syllabus' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class PatchSubjectDto {
  @ApiPropertyOptional({ example: 'MTH' })
  @IsString()
  @IsOptional()
  @MaxLength(20)
  code?: string;

  @ApiPropertyOptional({ example: 'Mathematics' })
  @IsString()
  @IsOptional()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ example: 'Updated syllabus details' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class ListSubjectsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({ example: 'active' })
  @IsOptional()
  status?: string;

  @ApiPropertyOptional({ example: 'Math', description: 'Search term' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ description: 'Academic session ID for candidate count' })
  @IsOptional()
  session_id?: string;
}
