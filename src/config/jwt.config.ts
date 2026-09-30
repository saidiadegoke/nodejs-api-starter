import { registerAs } from '@nestjs/config';
import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { JwtConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @ValidateIf(() => process.env.NODE_ENV === 'production')
  @IsNotEmpty({ message: 'JWT_SECRET is required in production' })
  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  @ValidateIf(() => process.env.NODE_ENV === 'production')
  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET is required in production' })
  @IsString()
  @IsOptional()
  JWT_REFRESH_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string;
}

export const jwtConfig = registerAs<JwtConfig>('jwt', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    secret: env.JWT_SECRET || process.env.JWT_SECRET || 'dev-secret-key-change-in-production-12345678',
    expiresIn: env.JWT_EXPIRES_IN || process.env.JWT_EXPIRES_IN || '15m',
    refreshSecret: env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key-change-in-production-12345678',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  };
});
