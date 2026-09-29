import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class SendMailDto {
  @ApiProperty({ description: 'Recipient email address' })
  @IsEmail()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Email subject line' })
  @IsString()
  @IsNotEmpty()
  subject!: string;

  @ApiProperty({ description: 'Template HTML filename (e.g. welcome.html)' })
  @IsString()
  @IsNotEmpty()
  templateFile!: string;

  @ApiPropertyOptional({ description: 'Placeholders object or array for template rendering' })
  @IsOptional()
  placeholders?: Record<string, any> | any[];

  @ApiPropertyOptional({ description: 'Optional reply-to email address' })
  @IsOptional()
  @IsEmail()
  replyTo?: string;

  @ApiPropertyOptional({ description: 'Optional custom sender email address' })
  @IsOptional()
  @IsEmail()
  fromEmail?: string;
}
