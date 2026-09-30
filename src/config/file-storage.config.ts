import { registerAs } from '@nestjs/config';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { FileStorageConfig } from './config.type';
import { validateConfig } from './validate-config';

enum DefaultFileProvider {
  Mock = 'mock',
  Local = 'local',
  S3 = 's3',
}

enum S3Provider {
  Aws = 'aws',
  DigitalOcean = 'digitalocean',
}

class EnvironmentVariablesValidator {
  @IsEnum(DefaultFileProvider)
  @IsOptional()
  DEFAULT_FILE_PROVIDER?: DefaultFileProvider;

  @IsEnum(S3Provider)
  @IsOptional()
  S3_PROVIDER?: S3Provider;

  @IsString()
  @IsOptional()
  DO_SPACES_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  DO_SPACES_SECRET?: string;

  @IsString()
  @IsOptional()
  DO_SPACES_REGION?: string;

  @IsString()
  @IsOptional()
  DO_SPACES_ENDPOINT?: string;

  @IsString()
  @IsOptional()
  DO_SPACES_BUCKET?: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_REGION?: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET_NAME?: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET?: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET_BASE_URL?: string;

  @IsInt()
  @IsOptional()
  STORAGE_LIMIT_MB?: number;
}

export const fileStorageConfig = registerAs<FileStorageConfig>('fileStorage', () => {
  const env = validateConfig(process.env, EnvironmentVariablesValidator);
  return {
    defaultProvider: (env.DEFAULT_FILE_PROVIDER || process.env.DEFAULT_FILE_PROVIDER || 'mock') as 'mock' | 'local' | 's3',
    s3Provider: (env.S3_PROVIDER || process.env.S3_PROVIDER || 'digitalocean') as 'aws' | 'digitalocean',
    storageLimitMb: env.STORAGE_LIMIT_MB || parseInt(process.env.STORAGE_LIMIT_MB || '1024', 10),
    doSpaces: {
      accessKey: env.DO_SPACES_ACCESS_KEY || process.env.DO_SPACES_ACCESS_KEY,
      secret: env.DO_SPACES_SECRET || process.env.DO_SPACES_SECRET,
      region: env.DO_SPACES_REGION || process.env.DO_SPACES_REGION || 'fra1',
      endpoint: env.DO_SPACES_ENDPOINT || process.env.DO_SPACES_ENDPOINT || 'https://fra1.digitaloceanspaces.com',
      bucket: env.DO_SPACES_BUCKET || process.env.DO_SPACES_BUCKET,
    },
    aws: {
      accessKeyId: env.AWS_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION || process.env.AWS_REGION || 'us-east-1',
      bucket: env.AWS_S3_BUCKET_NAME || env.AWS_S3_BUCKET || process.env.AWS_S3_BUCKET_NAME || process.env.AWS_S3_BUCKET,
      baseUrl: env.AWS_S3_BUCKET_BASE_URL || process.env.AWS_S3_BUCKET_BASE_URL,
    },
  };
});
