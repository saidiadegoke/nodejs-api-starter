import { FactoryProvider } from '@nestjs/common';
import { createClient } from 'redis';
import { ConfigService } from '@nestjs/config';

export const redisClientFactory: FactoryProvider<any> = {
  provide: 'RedisClient',
  useFactory: (configService: ConfigService) => {
    const host = configService.get<string>('redis.redisHost', { infer: true });
    const isTls = host?.startsWith('rediss://');
    const rejectUnauthorized = configService.get<boolean>(
      'redis.rejectUnauthorized',
      { infer: true },
    );
    const redisClient = createClient({
      url: host ?? '',
      socket: isTls ? { tls: true, rejectUnauthorized } : undefined,
    });

    redisClient.on('error', (e) => {
      try {
        throw new Error(`Redis connection failed: ${e}`);
      } catch {
        // intentionally empty
      }
    });

    redisClient.on('reconnecting', function () {
      return Error('Redis reconnecting...');
    });

    redisClient.on('connect', function () {
      return Error('Redis connect...');
    });

    redisClient.on('ready', function () {
      return Error('Redis connected! Cache Service is Working...');
    });

    return redisClient;
  },
  inject: [ConfigService],
};
