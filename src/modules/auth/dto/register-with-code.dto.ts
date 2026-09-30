import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterWithCodeDto {
  @ApiProperty({ example: 'UNILAG-2026-ABCD', description: 'Institution issued registration code' })
  @IsNotEmpty({ message: 'code is required' })
  @IsString()
  code!: string;

  // Honeypots
  @IsOptional()
  website?: string;

  @IsOptional()
  url?: string;

  @IsOptional()
  homepage?: string;
}
