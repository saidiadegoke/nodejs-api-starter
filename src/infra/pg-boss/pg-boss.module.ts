import { Global, Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PgBossService } from './pg-boss.service';
import { PgBossDashboardMiddleware } from './pg-boss-dashboard.middleware';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [PgBossService, PgBossDashboardMiddleware],
  exports: [PgBossService, PgBossDashboardMiddleware],
})
export class PgBossModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const rawBasePath = (process.env.PGBOSS_DASHBOARD_BASE_PATH || '/admin/queues').replace(/^\//, '');
    consumer
      .apply(PgBossDashboardMiddleware)
      .forRoutes(rawBasePath, `${rawBasePath}/*`, `${rawBasePath}.data`);
  }
}

