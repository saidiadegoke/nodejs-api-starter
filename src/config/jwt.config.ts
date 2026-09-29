import { registerAs } from '@nestjs/config';
import { IsOptional, IsString } from 'class-validator';
import { JwtConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  JWT_SECRET?: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

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
    secret: env.JWT_SECRET || 'dev-secret-key-change-in-production-12345678',
    expiresIn: env.JWT_EXPIRES_IN || '1h',
    refreshSecret: env.JWT_REFRESH_SECRET || 'dev-refresh-secret-key-change-in-production-12345678',
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN || '30d',
  };
});
