import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoggerFactory } from '../../logger';
import {
  AUDIT_AUTO_CAPTURE_SKIP_PREFIXES,
  HTTP_METHOD_VERB,
} from '../constants/audit-actions';
import {
  AUDIT_KEY,
  AUDIT_SKIP_KEY,
  AuditContext,
  AuditMetadata,
  AuditRequestLike,
} from '../decorators/audit.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuditWriterService } from '../services/audit-writer.service';
import { redactSensitive } from '../utils/redact';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Route segment that is a path parameter rather than a literal (`:id`, `:userId`). */
const isParamSegment = (segment: string) => segment.startsWith(':');

function firstPath(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

/** `':id/activate'` -> `'activate'`; `'/'` -> undefined. */
function lastLiteralSegment(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const segments = path.split('/').filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i -= 1) {
    if (!isParamSegment(segments[i])) return segments[i];
  }
  return undefined;
}

/** `'sessions/:id/open'` -> `'sessions'`. Needed when `@Controller()` carries no prefix. */
function firstLiteralSegment(path: string | undefined): string | undefined {
  if (!path) return undefined;
  return path.split('/').filter((s) => s && !isParamSegment(s))[0];
}

/** `'universities'` -> `'university'`. Deliberately naive — matches the legacy action names. */
function toSingular(segment: string): string {
  return segment.endsWith('s') && segment.length > 1 ? segment.slice(0, -1) : segment;
}

/** `'admin/users'` -> `'user'` (singularised, so `user.activate` matches the legacy names). */
function resourceSegment(controllerPath: string | undefined): string | undefined {
  const segments = (controllerPath || '').split('/').filter((s) => s && !isParamSegment(s));
  const last = segments[segments.length - 1];
  return last ? toSingular(last) : undefined;
}

/** Read `'a.b.0.c'` (and `'["a"]["b"]'`-free) out of a nested value. */
function readDotPath(source: any, path: string): any {
  if (source === null || source === undefined) return undefined;
  return path
    .split('.')
    .filter((part) => part.length > 0)
    .reduce((acc, part) => (acc === null || acc === undefined ? undefined : acc[part]), source);
}

/**
 * Capture state-changing requests into `admin_audit_logs` without per-call-site code.
 *
 * Runs as a global interceptor after `ResponseEnvelopeInterceptor`, so `result` is the raw
 * controller return value and this interceptor cannot interfere with the response envelope.
 * Successes are recorded on the handler's emitted value; failures only when the route opted
 * in with `@Audit(..., { auditFailures: true })`.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger;
  private readonly autoCapture: boolean;

  constructor(
    private readonly reflector: Reflector,
    private readonly writer: AuditWriterService,
    loggerFactory?: LoggerFactory,
  ) {
    this.logger = loggerFactory?.create(AuditInterceptor.name);
    this.autoCapture = String(process.env.AUDIT_AUTO_CAPTURE ?? 'true').toLowerCase() !== 'false';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (context.getType() !== 'http') return next.handle();

    const request = context.switchToHttp().getRequest<AuditRequestLike>();
    const method = String(request?.method || '').toUpperCase();
    const handler = context.getHandler();
    const controller = context.getClass();

    const skip =
      this.reflector.getAllAndOverride<boolean>(AUDIT_SKIP_KEY, [handler, controller]) === true;
    if (skip) return next.handle();

    const meta = this.reflector.getAllAndOverride<AuditMetadata | undefined>(AUDIT_KEY, [
      handler,
      controller,
    ]);

    if (!meta) {
      if (SAFE_METHODS.has(method)) return next.handle();
      if (!this.autoCapture) return next.handle();
      const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
        handler,
        controller,
      ]);
      if (isPublic) return next.handle();
    }

    // Nothing to attribute the action to; unauthenticated routes are not audited.
    if (!request?.user?.user_id) return next.handle();

    const route = {
      controllerPath: firstPath(this.reflector.get<string | string[]>(PATH_METADATA, controller)),
      handlerPath: firstPath(this.reflector.get<string | string[]>(PATH_METADATA, handler)),
    };

    if (!meta && this.isSkippedRoute(route.controllerPath)) return next.handle();

    const startedAt = Date.now();
    return next.handle().pipe(
      tap({
        next: (result: any) => {
          this.capture(request, route, meta, result, 200, Date.now() - startedAt, method);
        },
        error: (err: any) => {
          if (!meta?.auditFailures) return;
          const status = err?.getStatus?.() ?? err?.status ?? 500;
          this.capture(request, route, meta, undefined, status, Date.now() - startedAt, method);
        },
      }),
    );
  }

  private isSkippedRoute(controllerPath: string | undefined): boolean {
    const prefix = (controllerPath || '').split('/').filter(Boolean)[0];
    return !!prefix && AUDIT_AUTO_CAPTURE_SKIP_PREFIXES.includes(prefix);
  }

  /** Build the entry and hand it to the writer. Never throws. */
  private capture(
    req: AuditRequestLike,
    route: { controllerPath?: string; handlerPath?: string },
    meta: AuditMetadata | undefined,
    result: any,
    statusCode: number,
    durationMs: number,
    method: string,
  ): void {
    try {
      const ctx: AuditContext = { req, result, ...route };

      const action =
        (typeof meta?.action === 'function' ? meta.action(ctx) : meta?.action) ||
        this.deriveAction(route, method);
      if (!action) return;

      const resourceType = meta?.resourceType || resourceSegment(route.controllerPath) || null;
      const resourceId = this.resolveValue(meta?.resourceId, ctx);
      const universityId = this.resolveValue(meta?.universityId, ctx);

      const details = this.buildDetails(meta, ctx, {
        method,
        path: req.originalUrl || req.url,
        request_id: req.id ?? null,
        status_code: statusCode,
        duration_ms: durationMs,
      });

      const entry = {
        actorUserId: req.user!.user_id as string,
        action,
        resourceType,
        resourceId: resourceId ?? null,
        details,
        ipAddress: req.ip ?? null,
        userAgent: (req.headers?.['user-agent'] as string) ?? null,
        universityId: universityId ?? null,
      };

      if (meta?.durable) {
        void this.writer.log(entry);
      } else {
        this.writer.record(entry);
      }
    } catch (err: any) {
      this.logger?.warn?.(`Failed to capture audit entry: ${err?.message || err}`);
    }
  }

  private deriveAction(
    route: { controllerPath?: string; handlerPath?: string },
    method: string,
  ): string | null {
    const handlerFirst = firstLiteralSegment(route.handlerPath);
    const resource = resourceSegment(route.controllerPath) || (handlerFirst ? toSingular(handlerFirst) : undefined);
    if (!resource) return null;

    // Prefer the handler's own trailing literal (`.../approve` -> `approve`), but when that
    // segment is just the collection itself (`POST sessions` -> `sessions`) fall back to the
    // HTTP verb so we get `session.create` rather than `session.sessions`.
    const trailing = lastLiteralSegment(route.handlerPath);
    const verb =
      trailing && toSingular(trailing) !== resource ? trailing : HTTP_METHOD_VERB[method];
    if (!verb) return null;
    return `${resource}.${verb}`;
  }

  /**
   * Resolve a `'params:x'` / `'body:x'` / `'result:a.b'` spec (or a bare `'body'`), an
   * object, or a function against the request/handler result.
   */
  private resolveValue(resolver: any, ctx: AuditContext): any {
    if (resolver === null || resolver === undefined) return undefined;
    if (typeof resolver === 'function') return resolver(ctx);
    if (typeof resolver !== 'string') return resolver;

    if (resolver === 'body') return ctx.req.body;
    if (resolver.startsWith('params:')) return ctx.req.params?.[resolver.slice(7)];
    if (resolver.startsWith('query:')) return ctx.req.query?.[resolver.slice(6)];
    if (resolver.startsWith('body:')) return readDotPath(ctx.req.body, resolver.slice(5));
    if (resolver.startsWith('result:')) return readDotPath(ctx.result, resolver.slice(7));
    if (resolver.startsWith('params.')) return readDotPath(ctx.req.params, resolver.slice(7));
    if (resolver.startsWith('body.')) return readDotPath(ctx.req.body, resolver.slice(5));
    if (resolver.startsWith('result.')) return readDotPath(ctx.result, resolver.slice(7));
    return undefined;
  }

  /**
   * Annotated routes use their declared `details`; unannotated ones fall back to the
   * redacted request body. Either way the correlation block is attached, so every row can
   * be joined back to `request_logs` (there are no dedicated columns for it).
   */
  private buildDetails(
    meta: AuditMetadata | undefined,
    ctx: AuditContext,
    correlation: Record<string, any>,
  ): Record<string, any> {
    let declared: any;
    if (meta?.details !== undefined) {
      declared = this.resolveValue(meta.details, ctx);
    } else {
      declared = ctx.req.body;
    }

    let base: Record<string, any> | null = null;
    if (declared && typeof declared === 'object' && !Buffer.isBuffer(declared)) {
      base = redactSensitive(declared);
    } else if (declared !== undefined && declared !== null) {
      base = { value: declared };
    }

    return { ...(base || {}), _request: correlation };
  }
}
