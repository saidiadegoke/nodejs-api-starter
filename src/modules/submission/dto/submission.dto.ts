import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsIn,
  IsInt,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttachDocumentDto {
  @ApiProperty({
    description: 'Document requirement UUID',
    example: 'a0b1c2d3-e4f5-6789-0123-456789abcdef',
  })
  @IsUUID('4')
  @IsNotEmpty()
  requirement_id: string;

  @ApiProperty({
    description: 'Uploaded file UUID',
    example: 'b1c2d3e4-f5a6-7890-1234-56789abcdef0',
  })
  @IsUUID('4')
  @IsNotEmpty()
  file_id: string;

  @ApiPropertyOptional({
    description: 'Optional target registration UUID (defaults to latest active registration for user)',
    example: 'c2d3e4f5-a6b7-8901-2345-6789abcdef01',
  })
  @IsOptional()
  @IsUUID('4')
  registration_id?: string;

  @ApiPropertyOptional({
    description: 'Certificate source for result attachments (e.g. waec, neco, nabteb, gce, jamb)',
    enum: ['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other'],
    example: 'waec',
  })
  @IsOptional()
  @IsString()
  @IsIn(['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other'])
  source?: string;

  @ApiPropertyOptional({
    description: 'Sitting index for certificate (1 or 2)',
    enum: [1, 2],
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsIn([1, 2])
  sitting?: number;

  @ApiPropertyOptional({
    description: 'Institution type or issuer categorization',
    example: 'secondary',
  })
  @IsOptional()
  @IsString()
  institution_type?: string;
}

export class PatchDocumentDto {
  @ApiProperty({
    description: 'New replacement uploaded file UUID',
    example: 'b1c2d3e4-f5a6-7890-1234-56789abcdef0',
  })
  @IsUUID('4')
  @IsNotEmpty()
  file_id: string;

  @ApiPropertyOptional({
    description: 'Certificate source (waec, neco, nabteb, gce, jamb, other)',
    enum: ['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other'],
    example: 'waec',
  })
  @IsOptional()
  @IsString()
  @IsIn(['waec', 'neco', 'nabteb', 'gce', 'jamb', 'other'])
  source?: string;

  @ApiPropertyOptional({
    description: 'Sitting index for certificate (1 or 2)',
    enum: [1, 2],
    example: 1,
  })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  @IsIn([1, 2])
  sitting?: number;

  @ApiPropertyOptional({
    description: 'Institution type or issuer categorization',
    example: 'secondary',
  })
  @IsOptional()
  @IsString()
  institution_type?: string;
}

export class ValidateCompletenessDto {
  @ApiPropertyOptional({
    description: 'Registration UUID (defaults to latest active registration)',
    example: 'c2d3e4f5-a6b7-8901-2345-6789abcdef01',
  })
  @IsOptional()
  @IsUUID('4')
  registration_id?: string;
}

export class ReviewDocumentDto {
  @ApiPropertyOptional({
    description: 'Optional review note or feedback for acceptance / rejection',
    example: 'Document clear and fully legible',
  })
  @IsOptional()
  @IsString()
  review_note?: string;
}
