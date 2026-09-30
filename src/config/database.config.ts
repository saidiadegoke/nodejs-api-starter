import { registerAs } from '@nestjs/config';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { DatabaseConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @ValidateIf((env: EnvironmentVariablesValidator) => !env.DATABASE_URL)
  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @ValidateIf((env: EnvironmentVariablesValidator) => !env.DATABASE_URL)
  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  DB_PORT?: number;

  @ValidateIf((env: EnvironmentVariablesValidator) => !env.DATABASE_URL)
  @IsString()
  @IsOptional()
  DB_USER?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @ValidateIf((env: EnvironmentVariablesValidator) => !env.DATABASE_URL)
  @IsString()
  @IsOptional()
  DB_NAME?: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;

  @IsBoolean()
  @IsOptional()
  DB_SSL?: boolean;

  @IsInt()
  @IsOptional()
  DB_MAX_CONNECTIONS?: number;
}

export const databaseConfig = registerAs<DatabaseConfig>('database', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    host: env.DB_HOST || process.env.DB_HOST || 'localhost',
    port: env.DB_PORT || parseInt(process.env.DB_PORT || '5432', 10),
    user: env.DB_USER || process.env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || process.env.DB_PASSWORD || '',
    name: env.DB_NAME || process.env.DB_NAME || 'postgres',
    url: env.DATABASE_URL || process.env.DATABASE_URL,
    ssl: env.DB_SSL ?? (process.env.DB_SSL === 'true'),
    maxConnections: env.DB_MAX_CONNECTIONS || parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  };
});
