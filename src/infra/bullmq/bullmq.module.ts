import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AI_QUEUES, SYNC_QUEUES } from './queues.config';

/**
 * BullMQ module for background job queues.
 */
@Global()
@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const redisUrl =
          configService.get('redis.redisHost', { infer: true }) ||
          process.env.REDIS_URL ||
          'redis://localhost:6379';
        const rejectUnauthorized =
          configService.get<boolean>('redis.rejectUnauthorized', {
            infer: true,
          }) ?? false;

        let host = 'localhost';
        let port = 6379;
        let password: string | undefined;
        let username: string | undefined;
        let isTls = false;

        try {
          const url = new URL(redisUrl);
          host = url.hostname || 'localhost';
          port = parseInt(url.port, 10) || 6379;
          password = url.password || undefined;
          username = url.username || undefined;
          isTls = url.protocol === 'rediss:';
        } catch {
          // fallback default
        }

        return {
          connection: {
            host,
            port,
            password,
            username,
            tls: isTls ? { rejectUnauthorized } : undefined,
          },
        };
      },
      inject: [ConfigService],
    }),
    // Register queues
    BullModule.registerQueue({ name: SYNC_QUEUES.CANDIDATE_SYNC }),
    BullModule.registerQueue({ name: SYNC_QUEUES.SUBJECT_SYNC }),
    BullModule.registerQueue({ name: SYNC_QUEUES.INSTITUTION_SYNC }),
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
