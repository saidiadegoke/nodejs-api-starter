import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';

import { RedisRepositoryInterface } from '@interfaces/redis.repository.interface';

@Injectable()
export class RedisRepository
  implements OnModuleDestroy, RedisRepositoryInterface
{
  constructor(@Inject('RedisClient') private readonly redisClient: any) {}

  onModuleDestroy(): void {
    this.redisClient.disconnect();
  }

  async get(prefix: string, key: string): Promise<string | null> {
    return await this.redisClient.get(`${prefix}:${key}`);
  }

  async set(prefix: string, key: string, value: string): Promise<void> {
    await await this.redisClient.set(`${prefix}:${key}`, value);
  }

  async delete(prefix: string, key: string): Promise<void> {
    await await this.redisClient.del(`${prefix}:${key}`);
  }

  async setWithExpiry(
    prefix: string,
    key: string,
    value: string,
    expiry: number,
  ): Promise<void> {
    // node-redis options object — a positional 'EX' arg is silently ignored
    // by this client (the key would be stored WITHOUT any expiry).
    await this.redisClient.set(`${prefix}:${key}`, value, { EX: expiry });
  }
}
