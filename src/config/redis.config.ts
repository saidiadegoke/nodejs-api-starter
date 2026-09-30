import { registerAs } from '@nestjs/config';
import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';
import { RedisConfig } from './config.type';
import { validateConfig } from './validate-config';

class EnvironmentVariablesValidator {
  @IsString()
  @IsOptional()
  REDIS_URL?: string;

  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  @IsInt()
  @IsOptional()
  REDIS_PORT?: number;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  @IsString()
  @IsOptional()
  REDIS_USERNAME?: string;

  @IsBoolean()
  @IsOptional()
  REDIS_TLS?: boolean;

  @IsBoolean()
  @IsOptional()
  REDIS_REJECT_UNAUTHORIZED?: boolean;
}

export const redisConfig = registerAs<RedisConfig>('redis', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  const rawUrl = env.REDIS_URL || process.env.REDIS_URL || 'redis://localhost:6379';

  let host = env.REDIS_HOST || process.env.REDIS_HOST || 'localhost';
  let port = env.REDIS_PORT || parseInt(process.env.REDIS_PORT || '6379', 10);
  let password = env.REDIS_PASSWORD || process.env.REDIS_PASSWORD;
  let username = env.REDIS_USERNAME || process.env.REDIS_USERNAME;
  let isTls = env.REDIS_TLS ?? (process.env.REDIS_TLS === 'true');

  try {
    const parsedUrl = new URL(rawUrl);
    host = parsedUrl.hostname || host;
    port = parseInt(parsedUrl.port, 10) || port;
    password = parsedUrl.password || password;
    username = parsedUrl.username || username;
    isTls = parsedUrl.protocol === 'rediss:' || isTls;
  } catch {
    // rawUrl may be plain host string
  }

  const rejectUnauthorized = env.REDIS_REJECT_UNAUTHORIZED ?? (process.env.REDIS_REJECT_UNAUTHORIZED === 'true');

  return {
    url: rawUrl,
    redisHost: rawUrl,
    host,
    port,
    password,
    username,
    isTls,
    rejectUnauthorized,
  };
});
