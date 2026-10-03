import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class PatchNinIntakeDto {
  @ApiPropertyOptional({
    description: 'Partial form fields to merge into intake_payload',
    example: { university_id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d', subject_combination_id: 'c1b07384-d113-40f4-8a4e-379e4971c260' },
  })
  @IsOptional()
  @IsObject()
  intake_payload?: Record<string, any>;

  @ApiPropertyOptional({ description: 'Candidate full name or pre-verification name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Candidate email address' })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiPropertyOptional({ description: 'Candidate phone number' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Subject combination UUID' })
  @IsOptional()
  @IsString()
  subject_combination_id?: string;

  [key: string]: any;
}

