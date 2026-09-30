import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'MTH001', description: 'Course code' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Introductory Mathematics', description: 'Course title' })
  @IsString()
  @IsNotEmpty()
  title: string;

  @ApiPropertyOptional({ example: 'active', default: 'active' })
  @IsString()
  @IsOptional()
  status?: string;
}

export class CourseResponseDto {
  @ApiProperty({ example: 'c52ea11b-7a35-4ae2-a279-88fb7c3b99db' })
  id: string;

  @ApiProperty({ example: 'MTH001' })
  code: string;

  @ApiProperty({ example: 'Introductory Mathematics' })
  title: string;

  @ApiProperty({ example: 'active' })
  status: string;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-01-15T10:00:00.000Z' })
  updated_at: Date;
}
