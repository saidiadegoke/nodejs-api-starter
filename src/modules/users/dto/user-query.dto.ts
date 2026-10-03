import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UserQueryDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ example: 10, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiPropertyOptional({ example: 'john', description: 'Search term filter' })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ example: 'john', description: 'Search term alias' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'john', description: 'Search query alias' })
  @IsOptional()
  @IsString()
  query?: string;

  @ApiPropertyOptional({ example: 'student', description: 'Role filter' })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ example: true, description: 'Include all non-deleted users' })
  @IsOptional()
  include_all?: string | boolean;

  @ApiPropertyOptional({ example: true, description: 'Include students in search' })
  @IsOptional()
  include_students?: string | boolean;

  @ApiPropertyOptional({ example: false, description: 'Include institution admins' })
  @IsOptional()
  include_institution?: string | boolean;

  @ApiPropertyOptional({ example: 'super_admin', description: 'Comma-separated roles to exclude' })
  @IsOptional()
  exclude_roles?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ example: 'user@example.com', description: 'User email' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'User phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: 'active', description: 'User status (active, inactive, suspended)' })
  @IsOptional()
  @IsString()
  status?: string;
}
