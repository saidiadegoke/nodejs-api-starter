import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsArray,
  ValidateNested,
  IsIn,
  IsInt,
  Min,
  Max,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ResultItemDto {
  @ApiProperty({
    description: 'Course UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsUUID('4')
  @IsNotEmpty()
  course_id: string;

  @ApiProperty({
    description: 'Grade awarded (A, B, C, D, E, F)',
    example: 'A',
  })
  @IsString()
  @IsNotEmpty()
  grade: string;
}

export class UpsertResultsDto {
  @ApiProperty({
    description: 'Array of candidate course results',
    type: [ResultItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResultItemDto)
  results: ResultItemDto[];
}

export class ManualResultEntryItemDto {
  @ApiProperty({
    description: 'Examination certificate source',
    enum: ['waec', 'neco', 'nabteb', 'gce', 'jamb'],
    example: 'waec',
  })
  @IsString()
  @IsIn(['waec', 'neco', 'nabteb', 'gce', 'jamb'])
  source: string;

  @ApiProperty({
    description: 'Sitting number (1 or 2)',
    enum: [1, 2],
    example: 1,
  })
  @IsInt()
  @IsIn([1, 2])
  @Type(() => Number)
  sitting: number;

  @ApiProperty({
    description: '0-based serial index on certificate',
    example: 0,
  })
  @IsInt()
  @Min(0)
  @Type(() => Number)
  serial: number;

  @ApiProperty({
    description: 'Subject name',
    example: 'MATHEMATICS',
  })
  @IsString()
  @IsNotEmpty()
  subject: string;

  @ApiProperty({
    description: 'Raw grade recorded (e.g. A1, B2, C4, A, B)',
    example: 'A1',
  })
  @IsString()
  @IsNotEmpty()
  grade: string;

  @ApiPropertyOptional({
    description: 'Numerical score (0-100) if available',
    example: 85,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  score?: number;
}

export class BulkResultEntriesDto {
  @ApiProperty({
    description: 'Array of manual certificate subject entries',
    type: [ManualResultEntryItemDto],
  })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualResultEntryItemDto)
  entries: ManualResultEntryItemDto[];
}

export class PatchResultEntryDto {
  @ApiPropertyOptional({ example: 'PHYSICS' })
  @IsOptional()
  @IsString()
  subject?: string;

  @ApiPropertyOptional({ example: 'B2' })
  @IsOptional()
  @IsString()
  grade?: string;

  @ApiPropertyOptional({ example: 78 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  score?: number;
}

export class ReleaseToInstitutionsDto {
  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({ example: '2025/2026' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  release?: boolean;
}

export class ReleaseToStudentsDto {
  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({ example: '2025/2026' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  release_all?: boolean;

  @ApiPropertyOptional({
    description: 'Array of candidate registration UUIDs when selective release is desired',
    example: ['d3b07384-d113-40f4-8a4e-379e4971c260'],
  })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  registration_ids?: string[];
}

export class InstitutionResultsQueryDto {
  @ApiPropertyOptional({ example: 'd3b07384-d113-40f4-8a4e-379e4971c260' })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({ example: '2025/2026' })
  @IsOptional()
  @IsString()
  academic_year?: string;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({ example: 'Adewale', description: 'Search term' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 50, default: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
}
