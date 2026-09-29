import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_QUEUES } from './queues.config';

/**
 * BullMQ module for AI worker job queues.
 * Queues are consumed by Python workers in commod-ai-workers repo.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get('redis.redisHost', { infer: true }) ?? '';
        const rejectUnauthorized =
          configService.get<boolean>('redis.rejectUnauthorized', {
            infer: true,
          }) ?? true;
        const url = new URL(redisUrl);
        const isTls = url.protocol === 'rediss:';

        return {
          connection: {
            host: url.hostname,
            port: parseInt(url.port, 10) || 6379,
            password: url.password || undefined,
            username: url.username || undefined,
            tls: isTls ? { rejectUnauthorized } : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    // Register all AI queues
    BullModule.registerQueue({ name: AI_QUEUES.OCR_INGESTION }),
    BullModule.registerQueue({ name: AI_QUEUES.FIELD_EXTRACTION }),
    BullModule.registerQueue({ name: AI_QUEUES.CONTRACT_EXTRACTION }),
    BullModule.registerQueue({ name: AI_QUEUES.CROSSCHECK }),
    BullModule.registerQueue({ name: AI_QUEUES.INSPECTION_DELTA }),
    BullModule.registerQueue({ name: AI_QUEUES.SENTIMENT }),
    BullModule.registerQueue({ name: AI_QUEUES.DOCUMENT_VERIFICATION }),
    BullModule.registerQueue({ name: AI_QUEUES.CONTEXT_SYNC }),
    BullModule.registerQueue({ name: AI_QUEUES.MATCHMAKING }),
    BullModule.registerQueue({ name: AI_QUEUES.KB_INGESTION }),
    BullModule.registerQueue({ name: AI_QUEUES.FIELD_EXTRACTION_RESULT }),
    BullModule.registerQueue({ name: AI_QUEUES.CREDENTIAL_VERIFY }),
    BullModule.registerQueue({ name: AI_QUEUES.CREDENTIAL_VERIFY_RESULT }),
  ],
  exports: [BullModule],
})
export class BullMQModule {}
