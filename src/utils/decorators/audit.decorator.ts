import { SetMetadata } from '@nestjs/common';

export const AUDIT_KEY = 'AUDIT_METADATA';
export const AUDIT_SKIP_KEY = 'AUDIT_SKIP';

/** Minimal view of the Express request the resolvers are allowed to read. */
export interface AuditRequestLike {
  method?: string;
  originalUrl?: string;
  url?: string;
  params?: Record<string, any>;
  query?: Record<string, any>;
  body?: any;
  headers?: Record<string, any>;
  id?: string;
  ip?: string;
  user?: { user_id?: string; roles?: string[] } | null;
}

/** Passed to every resolver so an action/resource can depend on what happened. */
export interface AuditContext {
  req: AuditRequestLike;
  /** Raw value returned by the route handler (not the response envelope). */
  result: any;
  controllerPath?: string;
  handlerPath?: string;
}

export type AuditResolver = string | ((ctx: AuditContext) => any);

export interface AuditOptions {
  /** Defaults to the last literal segment of the controller route. */
  resourceType?: string;
  /**
   * `'params:<name>'`, `'body:<name>'`, `'result:<dot.path>'`, or a function.
   * `'result:data.id'` reads a nested/numeric path (`data.0.id` also works).
   */
  resourceId?: AuditResolver;
  /** `'body'`, `'body:<name>'`, `'params:<name>'`, `'result:<path>'`, an object, or a function. */
  details?: AuditResolver | Record<string, any>;
  /** Usually left unset — the actor's `profiles.jupeb_university_id` is resolved automatically. */
  universityId?: AuditResolver;
  /** Also record the attempt when the handler throws. Default false (legacy behaviour). */
  auditFailures?: boolean;
  /** Await a single INSERT instead of the buffered path. For actions that must not be lost. */
  durable?: boolean;
}

export interface AuditMetadata extends AuditOptions {
  action: string | ((ctx: AuditContext) => string | null | undefined);
}

/**
 * Declare the audit entry for a route handler (or a whole controller, as a default).
 *
 *   @Audit('session.institution_registration_lock', {
 *     resourceType: 'session',
 *     resourceId: 'params:sessionId',
 *     details: 'body',
 *   })
 *
 * Without it, a mutating route is still captured automatically with a derived
 * `resource.verb` action — `@Audit()` exists to pin an exact legacy name and to supply
 * `resourceId`/`details` the derivation cannot infer (see `AuditInterceptor`).
 */
export const Audit = (action: AuditMetadata['action'], options: AuditOptions = {}) =>
  SetMetadata(AUDIT_KEY, { action, ...options } as AuditMetadata);

/** Exclude a route (or controller) from audit capture entirely. */
export const AuditSkip = () => SetMetadata(AUDIT_SKIP_KEY, true);
