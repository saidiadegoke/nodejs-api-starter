import { registerAs } from '@nestjs/config';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { DatabaseConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  DB_HOST?: string;

  @IsInt()
  @Min(0)
  @Max(65535)
  @IsOptional()
  DB_PORT?: number;

  @IsString()
  @IsOptional()
  DB_USER?: string;

  @IsString()
  @IsOptional()
  DB_PASSWORD?: string;

  @IsString()
  @IsOptional()
  DB_NAME?: string;

  @IsString()
  @IsOptional()
  DATABASE_URL?: string;
}

export const databaseConfig = registerAs<DatabaseConfig>('database', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    host: env.DB_HOST || 'localhost',
    port: env.DB_PORT || 5432,
    user: env.DB_USER || 'postgres',
    password: env.DB_PASSWORD || 'postgres',
    name: env.DB_NAME || 'postgres',
    url: env.DATABASE_URL,
    maxConnections: parseInt(process.env.DB_MAX_CONNECTIONS || '20', 10),
  };
});
