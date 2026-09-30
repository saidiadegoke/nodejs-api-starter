import { registerAs } from '@nestjs/config';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { MailConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @IsInt()
  @IsOptional()
  SMTP_PORT?: number;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsString()
  @IsOptional()
  FROM_EMAIL?: string;
}

export const mailConfig = registerAs<MailConfig>('mail', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    host: env.SMTP_HOST || process.env.SMTP_HOST,
    port: env.SMTP_PORT || parseInt(process.env.SMTP_PORT || '587', 10),
    user: env.SMTP_USER || process.env.SMTP_USER,
    password: env.SMTP_PASSWORD || process.env.SMTP_PASSWORD,
    fromEmail: env.FROM_EMAIL || process.env.FROM_EMAIL || 'no-reply@example.com',
  };
});
