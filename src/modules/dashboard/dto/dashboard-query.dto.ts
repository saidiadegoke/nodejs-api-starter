import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsOptional, IsString, IsUUID, IsNumber, Min, Max } from 'class-validator';

export class DashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Filter by specific institution UUID',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by academic session UUID',
    example: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Target year for historical trends',
    example: 2026,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  year?: number;

  @ApiPropertyOptional({
    description: 'Max records to return for top lists or recent registrations',
    example: 10,
    default: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number;
}

export class StudentDashboardQueryDto {
  @ApiPropertyOptional({
    description: 'Optional candidate code for administrative override query',
    example: 'JUP/2026/00123',
  })
  @IsOptional()
  @IsString()
  candidate_code?: string;

  @ApiPropertyOptional({
    description: 'Filter by month in YYYY-MM format',
    example: '2026-09',
  })
  @IsOptional()
  @IsString()
  month?: string;

  @ApiPropertyOptional({
    description: 'Search keyword',
    example: 'Mathematics',
  })
  @IsOptional()
  @IsString()
  q?: string;
}

export class PatchUserJupebUniversityDto {
  @ApiProperty({
    description: 'Target JUPEB University UUID (or null to clear scope)',
    example: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    nullable: true,
  })
  @IsOptional()
  @IsUUID('4')
  jupeb_university_id: string | null;
}
