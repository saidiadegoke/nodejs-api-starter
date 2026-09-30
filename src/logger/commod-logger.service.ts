import { HttpService } from '@nestjs/axios';
import {
  ConsoleLogger,
  Inject,
  Injectable,
  LogLevel,
  Optional,
  Scope,
} from '@nestjs/common';
import { INQUIRER } from '@nestjs/core';
import { catchError, map } from 'rxjs/operators';
import { AxiosError } from 'axios';
import { lastValueFrom } from 'rxjs';
import { ConfigService } from '@nestjs/config';

// TRANSIENT scope: every injection site receives its OWN logger instance, the
// same way NestJS's built-in `Logger` works. The previous singleton shared a
// single mutable `context` field across the whole app, so whichever class last
// called `setContext()` (e.g. StripeWebhookController) relabelled the logs of
// every other consumer that didn't set its own (e.g. TiptapWebhookController).
// Transient gives each consumer a private `context`, so `[Context]` always
// names the class that actually emitted the line.
//
// NOTE: a transient provider cannot be resolved with `moduleRef.get()` /
// `app.get()` — use `LoggerFactory.create()` (a singleton bridge) instead.
// See `ServiceAbstract`, `ServiceAbstractRepoless` and `main.ts`.
@Injectable({ scope: Scope.TRANSIENT })
export class CommodLogger extends ConsoleLogger {
  private readonly grafanaEnabled: boolean;
  private readonly grafanaUrl: string;
  private readonly appName: string;
  private readonly isProduction: boolean;
  private readonly includeStackInProd: boolean;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    // INQUIRER resolves (on a TRANSIENT provider) to the class instance that
    // injected this logger, so we can auto-label its logs with that class name
    // — no per-consumer `setContext()` boilerplate. Consumers that DO call
    // `setContext()` override this default. Loggers built via
    // `LoggerFactory.create()` (manual `new`, no DI) receive no inquirer and
    // stay context-less unless an explicit context is passed.
    @Optional() @Inject(INQUIRER) inquirer?: object,
  ) {
    super();
    this.applyInquirerContext(inquirer);
    const nodeEnv =
      this.configService.get<string>('NODE_ENV', { infer: true }) ||
      process.env.NODE_ENV ||
      'development';
    this.isProduction = nodeEnv === 'production';
    this.includeStackInProd =
      (this.configService.get<string>('LOG_STACK_IN_PROD', { infer: true }) ||
        process.env.LOG_STACK_IN_PROD ||
        'false') === 'true';
    this.setLogLevels(
      this.isProduction
        ? ['log', 'warn', 'error']
        : ['log', 'warn', 'error', 'debug', 'verbose'],
    );
    const grafanaEnabledString =
      this.configService.get<string>('GRAFANA_ENABLED', { infer: true }) ||
      'false';

    this.grafanaEnabled = grafanaEnabledString.toLowerCase() === 'true';
    this.grafanaUrl =
      this.configService.get<string>('GRAFANA_URL', { infer: true }) || '';
    this.appName =
      this.configService.get<string>('APP_NAME', { infer: true }) ||
      'commod-api';
  }

  /**
   * Default the log context to the injecting class's name (via NestJS INQUIRER)
   * unless the inquirer is a bare object or unavailable. Consumers that call
   * `setContext()` themselves overwrite this afterwards.
   */
  private applyInquirerContext(inquirer?: object): void {
    const name = (inquirer as { constructor?: { name?: string } } | undefined)
      ?.constructor?.name;
    if (name && name !== 'Object') {
      this.setContext(name);
    }
  }

  /**
   * Logs a message with variable arguments.
   * @param args Multiple arguments similar to console.log.
   */
  log(...args: any[]): void {
    if (!this.isLevelEnabled('log')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'log');
    process.stdout.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'log');
  }

  /**
   * Logs an error with variable arguments.
   * @param args Multiple arguments similar to console.error.
   */
  error(...args: any[]): void {
    if (!this.isLevelEnabled('error')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'error');
    process.stderr.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'error');
  }

  /**
   * Logs a warning with variable arguments.
   * @param args Multiple arguments similar to console.warn.
   */
  warn(...args: any[]): void {
    if (!this.isLevelEnabled('warn')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'warn');
    process.stdout.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'warn');
  }

  /**
   * Logs a debug message with variable arguments.
   * @param args Multiple arguments similar to console.debug.
   */
  debug(...args: any[]): void {
    if (!this.isLevelEnabled('debug')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'debug');
    process.stdout.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'debug');
  }

  /**
   * Logs a verbose message with variable arguments.
   * @param args Multiple arguments similar to console.debug.
   */
  verbose(...args: any[]): void {
    if (!this.isLevelEnabled('verbose')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'verbose');
    process.stdout.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'verbose');
  }

  /**
   * Logs a fatal error with variable arguments.
   * @param args Multiple arguments; if an Error is passed, its stack is included.
   */
  fatal(...args: any[]): void {
    if (!this.isLevelEnabled('fatal')) return;
    const { message, trace } = this.extractMessageAndTrace(args);
    if (!message?.trim()) return;
    const formattedMessage = this.formatMessage(message, trace);
    const coloredMsg = this.colorize(formattedMessage, 'fatal');
    process.stderr.write(coloredMsg + '\n');
    void this.sendLogToGrafana(formattedMessage, 'fatal');
  }

  /**
   * Extracts a combined message string and an optional trace from the provided arguments.
   * If any argument is an instance of Error, its message is appended and its stack is used as trace.
   * @param args The arguments passed to a log method.
   * @returns An object containing a combined message and optional trace.
   */
  private extractMessageAndTrace(args: any[]): {
    message: string;
    trace?: string;
  } {
    let trace: string | undefined = undefined;
    const filteredArgs: any[] = [];

    // NestJS convention: the trailing arg may be a per-call context string
    // (`logger.log(msg, 'ClassName')`). Our context already comes from
    // setContext()/INQUIRER, so when the trailing arg merely repeats it, drop
    // it rather than dangling the class name at the end of every message.
    const working = [...args];
    const last = working[working.length - 1];
    if (typeof last === 'string' && last.length > 0 && last === this.context) {
      working.pop();
    }

    for (const arg of working) {
      if (arg === undefined || arg === null) {
        // Skip nullish args (e.g. `error(msg, undefined, ctx)`) so they don't
        // surface as blank tokens / extra spaces in the message.
        continue;
      } else if (arg instanceof Error) {
        if (!trace && arg.stack) trace = arg.stack;
        filteredArgs.push(arg.message);
      } else if (
        typeof arg === 'string' &&
        !trace &&
        (arg.includes('\n    at ') ||
          /^(Error|TypeError|RangeError|ReferenceError):/.test(arg))
      ) {
        // NestJS passes stack traces as plain strings: error(msg, stack, context)
        trace = arg;
      } else if (typeof arg === 'object') {
        filteredArgs.push(JSON.stringify(arg));
      } else {
        filteredArgs.push(arg);
      }
    }

    return { message: filteredArgs.join(' '), trace };
  }

  /**
   * Formats the log message by including timestamp, log level, context, message, and optional trace.
   * @param message The log message.
   * @param trace Optional stack trace for errors.
   * @returns Formatted log message.
   */
  public formatMessage(message: string, trace?: string): string {
    const timestamp = new Date().toISOString();
    const context = this.context ? `[${this.context}]` : '';
    const traceInfo =
      trace && this.shouldIncludeTrace() ? `\n Stack Trace: ${trace}` : '';
    return `[${timestamp}] ${context} - ${message}${traceInfo}`;
  }

  private shouldIncludeTrace(): boolean {
    return !this.isProduction || this.includeStackInProd;
  }

  /**
   * Sends the log message to Grafana's Loki if enabled.
   * @param message The formatted log message.
   * @param level The log level.
   */
  private async sendLogToGrafana(
    message: string,
    level: LogLevel,
  ): Promise<void> {
    if (!this.grafanaEnabled) {
      return;
    }
    const payload = {
      streams: [
        {
          stream: {
            app: this.appName,
            level: level,
          },
          values: [[this.getLokiTimestamp(), message]],
        },
      ],
    };
    try {
      await lastValueFrom(
        this.httpService
          .post(`${this.grafanaUrl}/loki/api/v1/push`, payload)
          .pipe(
            map((res: any) => res.data),
            catchError((error: AxiosError) => {
              const errorMsg = error.response
                ? `Grafana response error: ${error.response.status} - ${error.response.statusText}`
                : `Grafana request error: ${error.message}`;
              // Log the error using the base logger to avoid circular dependencies.
              super.error(`Failed to send log to Grafana: ${errorMsg}`);
              return []; // Swallow the error.
            }),
          ),
      );
    } catch (err) {
      super.error(`Unexpected error sending log to Grafana: ${err}`);
    }
  }

  /**
   * Generates a Loki-compatible timestamp in nanoseconds.
   * @returns Timestamp string in nanoseconds.
   */
  private getLokiTimestamp(): string {
    return `${Date.now()}000000`; // Convert milliseconds to nanoseconds.
  }
}
