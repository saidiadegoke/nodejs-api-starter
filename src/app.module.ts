import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import {
  appConfig,
  databaseConfig,
  jwtConfig,
  fileStorageConfig,
  redisConfig,
  mailConfig,
  integrationsConfig,
} from './config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { DatabaseModule } from './database';
import {
  SharedModule,
  AllExceptionsFilter,
  ResponseEnvelopeInterceptor,
  AuditInterceptor,
  RequestIdMiddleware,
  RequestLogMiddleware,
  SearchAliasMiddleware,
} from './utils';
import { AppController } from './app.controller';
import { ApiKeysModule } from './modules/api-keys';
import { UsersModule } from './modules/users';
import { AuthModule } from './modules/auth';
import { InstitutionsModule } from './modules/institutions';
import { SubjectsModule } from './modules/subjects';
import { CoursesModule } from './modules/courses';
import { DocumentRequirementsModule } from './modules/document-requirements';
import { PaymentCatalogModule } from './modules/payment-catalog';
import { SessionsModule } from './modules/sessions';
import { IdentityModule } from './modules/identity';
import { RegistrationModule } from './modules/registration';
import { SubmissionModule } from './modules/submission';
import { AcademicModule } from './modules/academic';
import { FinanceModule } from './modules/finance';
import { DashboardModule } from './modules/dashboard';
import { AdminModule } from './modules/admin';
import { FilesModule } from './modules/files';
import { NotificationsModule } from './modules/notifications';
import { SupportModule } from './modules/support';
import { MailModule } from './modules/mail';
import { AttendanceModule } from './modules/attendance';
import { CrmsModule } from './modules/crms';
import { OcrModule } from './modules/ocr';
import { BullMQModule } from './infra/bullmq/bullmq.module';
import { bullmqEnabled } from './infra/bullmq/bullmq-enabled';
import { PgBossModule } from './infra/pg-boss/pg-boss.module';
import { SyncModule } from './modules/sync';


@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        jwtConfig,
        fileStorageConfig,
        redisConfig,
        mailConfig,
        integrationsConfig,
      ],
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
    }),
    DatabaseModule,
    EventEmitterModule.forRoot({ wildcard: true }),
    PgBossModule,
    // Redis-backed queues only when Redis is configured (infra/bullmq/bullmq-enabled).
    ...(bullmqEnabled() ? [BullMQModule] : []),
    SharedModule,
    SyncModule,

    ApiKeysModule,
    UsersModule,
    AuthModule,
    InstitutionsModule,
    SubjectsModule,
    CoursesModule,
    DocumentRequirementsModule,
    PaymentCatalogModule,
    SessionsModule,
    IdentityModule,
    RegistrationModule,
    SubmissionModule,
    AcademicModule,
    FinanceModule,
    DashboardModule,
    AdminModule,
    FilesModule,
    NotificationsModule,
    SupportModule,
    MailModule,
    AttendanceModule,
    CrmsModule,
    OcrModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseEnvelopeInterceptor,
    },
    {
      // Registered after the envelope interceptor so it observes the raw controller
      // return value. Audits mutating routes; see AuditInterceptor.
      provide: APP_INTERCEPTOR,
      useClass: AuditInterceptor,
    },
    {
      provide: APP_PIPE,
      useValue: new ValidationPipe({
        transform: true,
        whitelist: true,
        errorHttpStatusCode: 422,
        exceptionFactory: (errors) => {
          // Flatten nested validation errors into detailed field array matching express-validator
          const formattedErrors = errors.map((err) => {
            const constraints = err.constraints ? Object.values(err.constraints) : [];
            return {
              type: 'field',
              value: err.value,
              msg: constraints[0] || 'Invalid value',
              path: err.property,
              location: 'body',
            };
          });
          return new UnprocessableEntityException({
            message: 'Validation failed',
            details: formattedErrors,
          });
        },
      }),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Middleware execution order:
    // 1. RequestIdMiddleware (generates / assigns req.id and header)
    // 2. RequestLogMiddleware (captures start time, hooks res.json, logs counters)
    // 3. SearchAliasMiddleware (maps search/query to q)
    consumer
      .apply(RequestIdMiddleware, RequestLogMiddleware, SearchAliasMiddleware)
      .forRoutes('*');

    const { csvUpload } = require('./utils/middleware/csv-upload.middleware');
    consumer
      .apply(csvUpload)
      .forRoutes(
        'catalog/universities/bulk',
        'institutions/bulk',
        'catalog/subjects/bulk',
        'subjects/bulk',
        'catalog/subject-combinations/bulk',
        'subject-combinations/bulk',
        'api/v1/catalog/universities/bulk',
        'api/v1/institutions/bulk',
        'api/v1/catalog/subjects/bulk',
        'api/v1/subjects/bulk',
        'api/v1/catalog/subject-combinations/bulk',
        'api/v1/subject-combinations/bulk',
      );
  }
}
