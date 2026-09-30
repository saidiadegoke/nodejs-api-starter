import {
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UserRoleEnum {
  SUPER_ADMIN = 'super_admin',
  ADMIN = 'admin',
  AGENT = 'agent',
  USER = 'user',
  REGISTRAR = 'registrar',
  PROGRAM_DIRECTOR = 'program_director',
  INSTITUTION_ADMIN = 'institution_admin',
}

export class RegisterDto {
  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'User email address' })
  @IsOptional()
  @IsEmail({}, { message: 'Valid email is required' })
  email?: string;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Phone number in E.164 format' })
  @IsOptional()
  @Matches(/^(\+)?\d{8,20}$/, {
    message: 'Valid phone number is required (8-20 digits, optional + prefix)',
  })
  phone?: string;

  @ApiPropertyOptional({ example: 1, description: 'Country ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Valid country ID is required' })
  country_id?: number;

  @ApiProperty({ example: 'Strong@Password1', description: 'Password (min 8 characters)' })
  @IsNotEmpty({ message: 'Password is required' })
  @Length(8, 255, { message: 'Password must be at least 8 characters' })
  password!: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsNotEmpty({ message: 'First name is required' })
  @IsString()
  first_name!: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsNotEmpty({ message: 'Last name is required' })
  @IsString()
  last_name!: string;

  @ApiProperty({
    enum: UserRoleEnum,
    example: UserRoleEnum.USER,
    description: 'User role (super_admin, admin, agent, user, registrar, program_director, institution_admin)',
  })
  @IsNotEmpty({ message: 'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)' })
  @IsEnum(UserRoleEnum, {
    message:
      'Valid role is required (super_admin, admin, agent, user, registrar, program_director, institution_admin)',
  })
  role!: string;

  @ApiPropertyOptional({ example: 'REF-12345', description: 'Optional referral code' })
  @IsOptional()
  @IsString()
  @MaxLength(32, { message: 'Referral code must be at most 32 characters' })
  referral_code?: string;

  // Honeypots
  @IsOptional()
  website?: string;

  @IsOptional()
  url?: string;

  @IsOptional()
  homepage?: string;
}
