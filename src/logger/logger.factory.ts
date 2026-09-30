import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CommodLogger } from './commod-logger.service';

/**
 * Singleton bridge for minting per-consumer {@link CommodLogger} instances.
 *
 * `CommodLogger` is `Scope.TRANSIENT`, which means it cannot be obtained via
 * `moduleRef.get()` / `app.get()` (those throw for non-default scopes). Code
 * that resolves the logger imperatively rather than through constructor DI —
 * `ServiceAbstract`, `ServiceAbstractRepoless`, and bootstrap in `main.ts` —
 * goes through this factory instead. Each `create()` returns a brand-new
 * logger with its own `context`, so there is no shared mutable state to bleed
 * between consumers.
 *
 * Lives in the `@Global()` `LoggerModule` (which imports `HttpModule`), so it
 * is resolvable everywhere and has access to `HttpService` for Loki transport.
 */
@Injectable()
export class LoggerFactory {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Create a fresh logger. Pass `context` to label every line this instance
   * emits (equivalent to `new Logger(context)` with NestJS's built-in logger).
   */
  create(context?: string): CommodLogger {
    const logger = new CommodLogger(this.httpService, this.configService);
    if (context) {
      logger.setContext(context);
    }
    return logger;
  }
}
