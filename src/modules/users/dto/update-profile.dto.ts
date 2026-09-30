import { IsOptional, IsString, IsInt, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString()
  last_name?: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Display name' })
  @IsOptional()
  @IsString()
  display_name?: string;

  @ApiPropertyOptional({ example: 'Johnathan Doe', description: 'Full legal name' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: 'Mr', description: 'Honorific title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Candidate', description: 'Professional title' })
  @IsOptional()
  @IsString()
  professional_title?: string;

  @ApiPropertyOptional({ example: 'Aspiring computer scientist', description: 'Short bio' })
  @IsOptional()
  @IsString()
  bio?: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/photos/avatar.jpg', description: 'Profile avatar URL' })
  @IsOptional()
  @IsString()
  profile_photo_url?: string;

  @ApiPropertyOptional({ example: '2000-01-01', description: 'Date of birth (YYYY-MM-DD)' })
  @IsOptional()
  @IsString()
  date_of_birth?: string;

  @ApiPropertyOptional({ example: 'male', description: 'Gender' })
  @IsOptional()
  @IsString()
  gender?: string;

  @ApiPropertyOptional({ example: 'en', description: 'Preferred language code' })
  @IsOptional()
  @IsString()
  preferred_language?: string;

  @ApiPropertyOptional({ example: 'Africa/Lagos', description: 'Timezone' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ example: 1, description: 'Country ID' })
  @IsOptional()
  @IsInt()
  country_id?: number;

  @ApiPropertyOptional({ example: 'Lagos', description: 'State / Province' })
  @IsOptional()
  @IsString()
  state_province?: string;

  @ApiPropertyOptional({ example: 'Secondary School', description: 'Highest educational level' })
  @IsOptional()
  @IsString()
  educational_level?: string;

  @ApiPropertyOptional({ example: 'Student', description: 'Employment status' })
  @IsOptional()
  @IsString()
  employment_status?: string;

  @ApiPropertyOptional({ example: true, description: 'Profile completion flag' })
  @IsOptional()
  @IsBoolean()
  profile_completed?: boolean;

  @ApiPropertyOptional({ example: '+2348012345678', description: 'Phone number' })
  @IsOptional()
  @IsString()
  phone?: string;
}
