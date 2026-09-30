import { IsNotEmpty, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateApiKeyDto {
  @ApiProperty({ example: 'Production Backend Service', description: 'Descriptive name for the API key' })
  @IsNotEmpty({ message: 'API key name is required' })
  @IsString({ message: 'API key name must be a string' })
  name: string;
}
