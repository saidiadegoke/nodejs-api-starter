import { registerAs } from '@nestjs/config';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { AppConfig } from './config.type';
import { validateConfig } from './validate-config';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
  Staging = 'staging',
}

class EnvironmentVariablesValidator {
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV?: Environment;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string;

  @IsString()
  @IsOptional()
  LOG_FORMAT?: string;

  @IsString()
  @IsOptional()
  LOG_LEVEL?: string;

  @IsString()
  @IsOptional()
  LOG_DIR?: string;
}

export const appConfig = registerAs<AppConfig>('app', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    nodeEnv: env.NODE_ENV || 'development',
    name: process.env.APP_NAME || 'JUPEB Portal API',
    port: env.PORT || 3000,
    apiPrefix: 'api',
    corsOrigin: env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:4070',
    logFormat: env.LOG_FORMAT || 'text',
    logLevel: env.LOG_LEVEL || 'info',
    logDir: env.LOG_DIR || '',
  };
});
