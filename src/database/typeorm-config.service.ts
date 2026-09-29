import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModuleOptions, TypeOrmOptionsFactory } from '@nestjs/typeorm';
import { AllConfigType } from '../config/config.type';

@Injectable()
export class TypeOrmConfigService implements TypeOrmOptionsFactory {
  constructor(private readonly configService: ConfigService<AllConfigType>) {}

  createTypeOrmOptions(): TypeOrmModuleOptions {
    const dbConfig = this.configService.get('database', { infer: true });

    return {
      type: 'postgres',
      host: dbConfig?.host,
      port: dbConfig?.port,
      username: dbConfig?.user,
      password: dbConfig?.password,
      database: dbConfig?.name,
      url: dbConfig?.url,
      ssl: dbConfig?.ssl ? { rejectUnauthorized: false } : false,
      extra: {
        max: dbConfig?.maxConnections || 20,
      },
      autoLoadEntities: true,
      synchronize: false, // Invariant: synchronize is ALWAYS false
      logging: process.env.NODE_ENV === 'development' && process.env.LOG_DEBUG === 'true',
    };
  }
}
