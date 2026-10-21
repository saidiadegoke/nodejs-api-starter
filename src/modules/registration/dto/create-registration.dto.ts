import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRegistrationDto {
  @ApiProperty({
    description: 'Target academic session UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsUUID('4')
  @IsNotEmpty()
  session_id: string;

  @ApiPropertyOptional({
    description: 'Target institution UUID (required if caller is not institution-scoped)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Assigned subject combination UUID',
    example: 'c1b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  subject_combination_id?: string;

  @ApiPropertyOptional({
    description: 'Verified NIN record UUID',
    example: 'e5b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  nin_verification_id?: string;

  @ApiPropertyOptional({
    description: 'Candidate 11-digit National Identification Number (NIN)',
    example: '00000000001',
  })
  @IsOptional()
  @IsString()
  nin?: string;

  @ApiPropertyOptional({
    description: 'Pre-existing candidate user account UUID',
    example: 'f6b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  user_id?: string;

  @ApiPropertyOptional({
    description: 'Institution custom registration identifier',
    example: 'UNILAG/2026/001',
  })
  @IsOptional()
  @IsString()
  institution_issued_code?: string;
}

export class PatchRegistrationDto {
  @ApiPropertyOptional({
    description: 'Update assigned subject combination UUID',
    example: 'c1b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  subject_combination_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  subjectCombinationId?: string;

  @ApiPropertyOptional({
    description: 'Update institution issued code',
    example: 'UNILAG/2026/002',
  })
  @IsOptional()
  @IsString()
  institution_issued_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institutionIssuedCode?: string;

  @ApiPropertyOptional({
    description: 'Status modification (e.g. withdrawn, approved, rejected)',
    example: 'withdrawn',
  })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    description: 'Status modification reason or review remark',
    example: 'Subject combination adjusted by department',
  })
  @IsOptional()
  @IsString()
  status_reason?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  statusReason?: string;
}

export class PatchCandidateDto {
  @ApiPropertyOptional({ description: 'Nested info object from frontend forms' })
  @IsOptional()
  info?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Assigned subject combination UUID' })
  @IsOptional()
  @IsUUID('4')
  subject_combination_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  subjectCombinationId?: string;

  @ApiPropertyOptional({ description: 'Institution issued student identifier' })
  @IsOptional()
  @IsString()
  institution_issued_code?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  institutionIssuedCode?: string;

  @ApiPropertyOptional({ example: 'Adewale' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Adeyemi' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Oluwaseun' })
  @IsOptional()
  @IsString()
  middle_name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  middleName?: string;

  @ApiPropertyOptional({ example: 'Mr' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'male' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: '2004-05-15' })
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dateOfBirth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  dob?: string;

  @ApiPropertyOptional({ example: '+2348012345678' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: 'candidate@example.com' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ example: 'Lagos State' })
  @IsOptional()
  @IsString()
  state_of_origin?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  stateOfOrigin?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional({ example: '123 Campus Way, Lagos' })
  @IsOptional()
  @IsString()
  residential_address?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  residentialAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Ikeja' })
  @IsOptional()
  @IsString()
  place_of_birth?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  placeOfBirth?: string;

  @ApiPropertyOptional({ description: 'Next of kin details' })
  @IsOptional()
  next_of_kin?: any;

  @ApiPropertyOptional()
  @IsOptional()
  nextOfKin?: any;

  @ApiPropertyOptional({ description: 'Uploaded documents array' })
  @IsOptional()
  documents?: any[];
}
