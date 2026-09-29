import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ValidationPipe, UnprocessableEntityException } from '@nestjs/common';
import { appConfig, databaseConfig, jwtConfig } from './config';
import { DatabaseModule } from './database';
import {
  SharedModule,
  AllExceptionsFilter,
  ResponseEnvelopeInterceptor,
  RequestIdMiddleware,
  RequestLogMiddleware,
  SearchAliasMiddleware,
} from './shared';
import { AppController } from './app.controller';
import { ApiKeysModule } from './modules/api-keys';
import { UsersModule } from './modules/users';
import { AuthModule } from './modules/auth';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, databaseConfig, jwtConfig],
      envFilePath: process.env.NODE_ENV === 'test' ? ['.env.test', '.env'] : ['.env'],
    }),
    DatabaseModule,
    SharedModule,
    ApiKeysModule,
    UsersModule,
    AuthModule,
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
  }
}
