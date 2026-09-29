import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsArray,
  IsBoolean,
  IsUUID,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSubjectCombinationDto {
  @ApiProperty({ example: 'BCP', description: 'Unique subject combination code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiPropertyOptional({ example: 'Biology, Chemistry, Physics', description: 'Display title' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiProperty({
    example: ['BIO', 'CHM', 'PHY'],
    description: 'Array of 3 to 6 subject codes or names',
  })
  @IsArray()
  @IsNotEmpty()
  subjects: string[];

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  is_global?: boolean;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsUUID()
  @IsOptional()
  university_id?: string;
}

export class PatchSubjectCombinationDto {
  @ApiPropertyOptional({ example: 'BCP' })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiPropertyOptional({ example: 'Biology, Chemistry, Physics' })
  @IsString()
  @IsOptional()
  title?: string;

  @ApiPropertyOptional({ example: ['BIO', 'CHM', 'PHY'] })
  @IsArray()
  @IsOptional()
  subjects?: string[];

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  is_global?: boolean;

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsUUID()
  @IsOptional()
  university_id?: string;
}

export class ListSubjectCombinationsQueryDto {
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

  @ApiPropertyOptional({ example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d' })
  @IsUUID()
  @IsOptional()
  university_id?: string;

  @ApiPropertyOptional({ example: 'Science' })
  @IsString()
  @IsOptional()
  q?: string;

  @ApiPropertyOptional({ example: 'code' })
  @IsString()
  @IsOptional()
  sort_by?: string;

  @ApiPropertyOptional({ example: 'code' })
  @IsString()
  @IsOptional()
  sortBy?: string;

  @ApiPropertyOptional({ example: 'ASC' })
  @IsString()
  @IsOptional()
  sort_order?: string;

  @ApiPropertyOptional({ example: 'ASC' })
  @IsString()
  @IsOptional()
  sortOrder?: string;
}
