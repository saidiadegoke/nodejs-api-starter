import { registerAs } from '@nestjs/config';
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
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

  @IsString()
  @IsOptional()
  APP_NAME?: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  PORT?: number;

  @IsString()
  @IsOptional()
  API_BASE_URL?: string;

  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;

  @IsString()
  @IsOptional()
  INSTITUTION_FRONTEND_URL?: string;

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

  @IsBoolean()
  @IsOptional()
  LOG_DEBUG?: boolean;

  @IsString()
  @IsOptional()
  API_DOCS_PASSWORD?: string;

  @IsBoolean()
  @IsOptional()
  RATE_LIMIT_ENABLED?: boolean;

  @IsInt()
  @IsOptional()
  RATE_LIMIT_WINDOW_MS?: number;

  @IsInt()
  @IsOptional()
  RATE_LIMIT_MAX_REQUESTS?: number;
}

export const appConfig = registerAs<AppConfig>('app', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    nodeEnv: env.NODE_ENV || 'development',
    name: env.APP_NAME || process.env.APP_NAME || 'JUPEB',
    port: env.PORT || parseInt(process.env.PORT || '5269', 10),
    apiPrefix: 'api',
    apiBaseUrl: env.API_BASE_URL || process.env.API_BASE_URL || 'http://localhost:5269',
    frontendUrl: env.FRONTEND_URL || process.env.FRONTEND_URL,
    institutionFrontendUrl: env.INSTITUTION_FRONTEND_URL || process.env.INSTITUTION_FRONTEND_URL,
    corsOrigin: env.CORS_ORIGIN || process.env.CORS_ORIGIN || 'http://localhost:3000,http://localhost:4070,http://localhost:5270',
    logFormat: env.LOG_FORMAT || process.env.LOG_FORMAT || 'text',
    logLevel: env.LOG_LEVEL || process.env.LOG_LEVEL || 'info',
    logDir: env.LOG_DIR || process.env.LOG_DIR || '',
    logDebug: env.LOG_DEBUG ?? (process.env.LOG_DEBUG === 'true'),
    apiDocsPassword: env.API_DOCS_PASSWORD || process.env.API_DOCS_PASSWORD,
    rateLimitEnabled: env.RATE_LIMIT_ENABLED ?? (process.env.RATE_LIMIT_ENABLED !== 'false'),
    rateLimitWindowMs: env.RATE_LIMIT_WINDOW_MS || parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    rateLimitMaxRequests: env.RATE_LIMIT_MAX_REQUESTS || parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  };
});
