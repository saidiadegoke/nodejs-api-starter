import { Global, Module } from '@nestjs/common';
import { LoggerModule } from '../logger/logger.module';
import { ResponseEnvelopeInterceptor } from './interceptors/response-envelope.interceptor';
import { AuditInterceptor } from './interceptors/audit.interceptor';
import { AuditWriterService } from './services/audit-writer.service';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { RequestIdMiddleware } from './middleware/request-id.middleware';
import { SearchAliasMiddleware } from './middleware/search-alias.middleware';
import { RequestLogMiddleware } from './middleware/request-log.middleware';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PermissionsGuard } from './guards/permissions.guard';

@Global()
@Module({
  imports: [LoggerModule],
  providers: [
    ResponseEnvelopeInterceptor,
    AuditInterceptor,
    AuditWriterService,
    AllExceptionsFilter,
    RequestIdMiddleware,
    SearchAliasMiddleware,
    RequestLogMiddleware,
    JwtAuthGuard,
    PermissionsGuard,
  ],
  exports: [
    LoggerModule,
    ResponseEnvelopeInterceptor,
    AuditInterceptor,
    AuditWriterService,
    AllExceptionsFilter,
    RequestIdMiddleware,
    SearchAliasMiddleware,
    RequestLogMiddleware,
    JwtAuthGuard,
    PermissionsGuard,
  ],
})
export class SharedModule {}
