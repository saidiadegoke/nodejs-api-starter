import { Global, Module } from '@nestjs/common';
import { redisClientFactory } from '@infraRedis/redis.client.factory';
import { RedisRepository } from '@infraRedis/repository/redis.repository';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  controllers: [],
  providers: [redisClientFactory, RedisRepository],
  exports: ['RedisClient'],
})
export class RedisModule {}
