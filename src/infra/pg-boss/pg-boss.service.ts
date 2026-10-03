import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { PgBoss, SendOptions, WorkOptions, Job } from 'pg-boss';

const CONTEXT = 'PgBossService';


@Injectable()
export class PgBossService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CONTEXT);
  private boss: PgBoss | null = null;

  private isStarted = false;
  private startPromise: Promise<boolean> | null = null;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.ensureStarted();
  }

  async ensureStarted(): Promise<boolean> {
    if (this.isStarted && this.boss) {
      return true;
    }
    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = (async () => {
      try {
        const dbConfig = this.configService.get<any>('database');
        const databaseUrl = process.env.DATABASE_URL || dbConfig?.url;
        const schema = process.env.PGBOSS_SCHEMA || 'pgboss';
        const ssl =
          dbConfig?.ssl ?? (process.env.DB_SSL === 'true')
            ? { rejectUnauthorized: false }
            : undefined;

        let bossConfig: any;

        if (databaseUrl) {
          bossConfig = {
            connectionString: databaseUrl,
            schema,
            persistQueueStats: true,
          };
          if (ssl) {
            bossConfig.ssl = ssl;
          }
        } else {
          bossConfig = {
            host: dbConfig?.host || process.env.DB_HOST || 'localhost',
            port: dbConfig?.port || parseInt(process.env.DB_PORT || '5432', 10),
            user: dbConfig?.user || process.env.DB_USER || 'postgres',
            password: dbConfig?.password || process.env.DB_PASSWORD || '',
            database: dbConfig?.name || process.env.DB_NAME || 'reg_portal_db',
            schema,
            persistQueueStats: true,
          };
          if (ssl) {
            bossConfig.ssl = ssl;
          }
        }

        const dynamicImport = new Function('modulePath', 'return import(modulePath)');
        const pgBossModule = await dynamicImport('pg-boss');
        const PgBossClass = pgBossModule.PgBoss || pgBossModule.default || pgBossModule;

        this.boss = new PgBossClass(bossConfig);

        this.boss.on('error', (error) => {
          this.logger.error('pg-boss background worker error:', error);
        });

        await this.boss.start();
        this.isStarted = true;
        this.logger.log(`pg-boss background job service initialized successfully on PostgreSQL (schema: ${schema}).`);
        return true;
      } catch (err: any) {
        this.logger.error(`pg-boss initialization failed: ${err.message}`, err.stack);
        this.isStarted = false;
        this.boss = null;
        return false;
      } finally {
        this.startPromise = null;
      }
    })();


    return this.startPromise;
  }

  async onModuleDestroy() {
    if (this.boss && this.isStarted) {
      try {
        await this.boss.stop({ graceful: true, timeout: 5000 });
        this.isStarted = false;
        this.logger.log('pg-boss background job service stopped.');
      } catch (err: any) {
        this.logger.error('Error stopping pg-boss:', err);
      }
    }
  }

  private createdQueues = new Set<string>();

  /**
   * Ensure a queue exists in pg-boss schema before registering workers or sending jobs.
   */
  async createQueue(queueName: string, options?: any): Promise<void> {
    const started = await this.ensureStarted();
    if (!started || !this.boss) {
      this.logger.warn(`pg-boss not started or unavailable, skipping queue creation for: ${queueName}`);
      return;
    }
    if (this.createdQueues.has(queueName)) {
      return;
    }
    try {
      await this.boss.createQueue(queueName, options);
      this.createdQueues.add(queueName);
    } catch (err: any) {
      this.logger.warn(`Notice during createQueue (${queueName}): ${err.message}`);
      this.createdQueues.add(queueName);
    }
  }

  /**
   * Enqueue a job into PostgreSQL pg-boss queue.
   */
  async send(queueName: string, data: any, options: SendOptions = {}): Promise<string | null> {
    const started = await this.ensureStarted();
    if (!started || !this.boss) {
      this.logger.warn(`pg-boss not started or unavailable, skipping enqueue for queue: ${queueName}`);
      return null;
    }
    try {
      await this.createQueue(queueName);
      const jobId = await this.boss.send(queueName, data, options);
      return jobId as string | null;
    } catch (err: any) {
      this.logger.error(`Failed to send job to pg-boss queue ${queueName}: ${err.message}`, err.stack);
      return null;
    }
  }

  /**
   * Register a background worker handler for a queue.
   */
  async work(
    queueName: string,
    handler: (jobs: Job<any> | Job<any>[]) => Promise<any>,
    options?: WorkOptions,
  ): Promise<string | null> {
    const started = await this.ensureStarted();
    if (!started || !this.boss) {
      this.logger.warn(`pg-boss not started or unavailable, skipping work handler registration for queue: ${queueName}`);
      return null;
    }
    try {
      await this.createQueue(queueName);
      return (await this.boss.work(queueName, options as any, handler as any)) as string | null;
    } catch (err: any) {
      this.logger.error(`Failed to register worker for pg-boss queue ${queueName}: ${err.message}`, err.stack);
      return null;
    }
  }

  getBossInstance(): PgBoss | null {
    return this.boss;
  }
}

