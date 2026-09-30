import { IsUUID } from 'class-validator';

export class ApiKeyIdParamDto {
  @IsUUID('all', { message: 'Invalid API key ID' })
  id: string;
}
