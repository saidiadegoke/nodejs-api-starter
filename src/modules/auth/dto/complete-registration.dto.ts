import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CompleteRegistrationDto {
  @ApiProperty({ example: 'UNILAG-2026-ABCD', description: 'Institution issued registration code' })
  @IsNotEmpty({ message: 'code is required' })
  @IsString()
  code!: string;

  @ApiProperty({ example: 'Strong@Password1', description: 'Account password (min 8 characters)' })
  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, 255, { message: 'Password must be at least 8 characters' })
  password!: string;

  @ApiPropertyOptional({ example: 'student@example.com', description: 'Email address' })
  @IsOptional()
  @IsEmail({}, { message: 'Valid email is required' })
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Phone number in E.164 format' })
  @IsOptional()
  @Matches(/^(\+)?\d{8,20}$/, {
    message: 'Valid phone number is required (8-20 digits, optional + prefix)',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 'John', description: 'First name override' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name override' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: 'Johnny', description: 'Middle name override' })
  @IsOptional()
  @IsString()
  middle_name?: string;

  @ApiPropertyOptional({ example: 'male', description: 'Gender override' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '2000-01-01', description: 'Date of birth override' })
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: '123 Campus Way, Lagos', description: 'Residential address' })
  @IsOptional()
  @IsString()
  residential_address?: string;

  @ApiPropertyOptional({ example: 'a12b3c4d-5678-90ef-gh12-34567890abcd', description: 'Profile photo file ID' })
  @IsOptional()
  @IsUUID('all', { message: 'Valid file_id is required' })
  file_id?: string;

  @ApiPropertyOptional({ example: 'a12b3c4d-5678-90ef-gh12-34567890abcd', description: 'Registration row ID alias' })
  @IsOptional()
  @IsUUID('all', { message: 'Valid id is required' })
  id?: string;

  @ApiPropertyOptional({ example: { name: 'Jane Doe', phone: '+2348099999999', relationship: 'Mother' }, description: 'Next of kin record' })
  @IsOptional()
  next_of_kin?: Record<string, unknown>;

  // Honeypots
  @IsOptional()
  website?: string;

  @IsOptional()
  url?: string;

  @IsOptional()
  homepage?: string;
}
