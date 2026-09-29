import {
  IsOptional,
  IsString,
  IsUUID,
  IsIn,
  IsArray,
  IsInt,
  Min,
  IsNotEmpty,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class ListRegistrationsQueryDto {
  @ApiPropertyOptional({ example: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @ApiPropertyOptional({ example: 20, default: 20 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  limit?: number;
  @ApiPropertyOptional({
    description: 'Filter by academic session UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by institution UUID',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Filter by registration workflow status',
    example: 'approved',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Filter by biometric capture status',
    enum: ['all', 'with_biometrics', 'without_biometrics'],
    example: 'all',
  })
  @IsOptional()
  @IsString()
  biometrics?: string;

  @ApiPropertyOptional({
    description: 'Search query across name, candidate number, email, phone, NIN last 4',
    example: 'Adewale',
  })
  @IsOptional()
  @IsString()
  q?: string;
}

export class ClaimCodeDto {
  @ApiProperty({
    description: '7-digit provisional candidate code or claim code',
    example: '1234567',
  })
  @IsString()
  @IsNotEmpty()
  code: string;
}

export class ConfirmSubjectsDto {
  @ApiProperty({
    description: 'Confirmed subject combination UUID',
    example: 'c1b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsUUID('4')
  @IsNotEmpty()
  subject_combination_id: string;
}

export class BatchRegistrationActionDto {
  @ApiProperty({
    description: 'Array of registration UUIDs to execute batch action upon',
    example: ['d3b07384-d113-40f4-8a4e-379e4971c260'],
  })
  @IsArray()
  @IsUUID('4', { each: true })
  registration_ids: string[];

  @ApiProperty({
    description: 'Batch action to apply',
    enum: ['approve', 'reject', 'withdraw'],
    example: 'approve',
  })
  @IsString()
  @IsIn(['approve', 'reject', 'withdraw'])
  action: string;

  @ApiPropertyOptional({
    description: 'Administrative remark or rejection reason',
    example: 'Batch approval following senate clearance',
  })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateNextOfKinDto {
  @ApiProperty({ example: 'Mrs. Folashade Adeyemi' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'mother' })
  @IsString()
  @IsNotEmpty()
  relationship: string;

  @ApiPropertyOptional({ example: '+2348098765432' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'folashade@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: '123 Campus Way, Lagos' })
  @IsOptional()
  @IsString()
  address?: string;
}
