import * as dotenv from 'dotenv';

// Read here, not through ConfigService: the modules below decide their imports when their
// files load, before Nest's ConfigModule has read .env.
dotenv.config({ path: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'], quiet: true });

/**
 * Whether the BullMQ (Redis) queues and workers are loaded. Sync runs on pg-boss
 * (Postgres), so without Redis the app runs fully and no connection to it is attempted.
 *
 * BULLMQ_ENABLED=true|false decides; when unset, they load only if Redis is configured
 * (REDIS_URL or REDIS_HOST).
 */
export const bullmqEnabled = (): boolean => {
  const flag = (process.env.BULLMQ_ENABLED || '').trim().toLowerCase();
  if (flag) return flag === 'true' || flag === '1';
  return !!(process.env.REDIS_URL || process.env.REDIS_HOST);
};
