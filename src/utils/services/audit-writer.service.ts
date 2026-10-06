import { Injectable, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { LoggerFactory } from '../../logger';
import { redactSensitive } from '../utils/redact';

export interface AuditWriteInput {
  actorUserId: string;
  action: string;
  resourceType?: string | null;
  resourceId?: string | number | null;
  details?: any;
  ipAddress?: string | null;
  userAgent?: string | null;
  universityId?: string | null;
}

const COLUMNS = [
  'admin_user_id',
  'action',
  'resource_type',
  'resource_id',
  'details',
  'ip_address',
  'user_agent',
  'jupeb_university_id',
];

function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function safeStringify(value: any): string | null {
  if (value === null || value === undefined) return null;
  try {
    return JSON.stringify(redactSensitive(value));
  } catch {
    return null;
  }
}

/**
 * The write side of the audit trail.
 *
 * `log()` issues one awaited INSERT — the durable path, used by `@Audit({ durable: true })`
 * and the static `AdminAuditService.log()` compatibility shim. `record()` is the hot path
 * used by `AuditInterceptor`: fire-and-forget, and batched when `AUDIT_BATCH_MAX` is raised
 * above its default of 1 (which flushes every entry immediately, preserving the
 * read-after-write behaviour the API tests rely on).
 *
 * Mirrors `RequestLogMiddleware`, which already persists request data fire-and-forget and
 * swallows its own errors — audit writes must never fail the request they describe.
 */
@Injectable()
export class AuditWriterService implements OnModuleInit, OnModuleDestroy {
  private readonly logger;
  private buffer: AuditWriteInput[] = [];
  private timer?: NodeJS.Timeout;
  private readonly batchMax = Math.max(1, intFromEnv('AUDIT_BATCH_MAX', 1));
  private readonly flushMs = intFromEnv('AUDIT_FLUSH_MS', 0);

  constructor(
    @Optional() private readonly dataSource?: DataSource,
    loggerFactory?: LoggerFactory,
  ) {
    this.logger = loggerFactory?.create(AuditWriterService.name);
  }

  onModuleInit() {
    setAuditWriter(this);
    if (this.flushMs > 0) {
      this.timer = setInterval(() => void this.flush(), this.flushMs);
      this.timer.unref?.();
    }
  }

  async onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    await this.flush();
  }

  /** Durable single-row write. Resolves once the row is committed. */
  async log(input: AuditWriteInput): Promise<void> {
    await this.write([input]);
  }

  /** Buffered write for the request hot path. Never throws. */
  record(input: AuditWriteInput): void {
    if (!input?.actorUserId || !input?.action) return;
    this.buffer.push(input);
    if (this.buffer.length >= this.batchMax) {
      void this.flush();
    }
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const batch = this.buffer;
    this.buffer = [];
    await this.write(batch);
  }

  private async write(entries: AuditWriteInput[]): Promise<void> {
    const rows = entries.filter((e) => e?.actorUserId && e?.action);
    if (rows.length === 0) return;

    if (!this.dataSource) {
      this.logger?.warn?.(
        `Dropped ${rows.length} audit entr${rows.length === 1 ? 'y' : 'ies'}: DataSource unavailable`,
      );
      return;
    }

    try {
      const universityByActor = await this.resolveUniversities(rows);

      const params: any[] = [];
      const tuples = rows.map((entry) => {
        const values = [
          entry.actorUserId,
          entry.action,
          entry.resourceType ?? null,
          entry.resourceId === null || entry.resourceId === undefined
            ? null
            : String(entry.resourceId),
          safeStringify(entry.details),
          entry.ipAddress ?? null,
          entry.userAgent ?? null,
          entry.universityId ?? universityByActor.get(entry.actorUserId) ?? null,
        ];
        const placeholders = values.map((value) => {
          params.push(value);
          return `$${params.length}`;
        });
        return `(${placeholders.join(', ')})`;
      });

      await this.dataSource.query(
        `INSERT INTO admin_audit_logs (${COLUMNS.join(', ')}) VALUES ${tuples.join(', ')}`,
        params,
      );
    } catch (err: any) {
      this.logger?.error?.(`Failed to write ${rows.length} audit entr(ies): ${err?.message || err}`);
    }
  }

  /**
   * One lookup per flush for the actors that did not carry an explicit university,
   * instead of the per-insert query the legacy path performed.
   */
  private async resolveUniversities(rows: AuditWriteInput[]): Promise<Map<string, string | null>> {
    const resolved = new Map<string, string | null>();
    const missing = Array.from(
      new Set(rows.filter((row) => !row.universityId).map((row) => row.actorUserId)),
    );
    if (missing.length === 0) return resolved;

    try {
      const found: { user_id: string; jupeb_university_id: string | null }[] =
        await this.dataSource.query(
          `SELECT user_id, jupeb_university_id FROM profiles WHERE user_id = ANY($1::uuid[])`,
          [missing],
        );
      for (const row of found) resolved.set(row.user_id, row.jupeb_university_id ?? null);
    } catch (err: any) {
      this.logger?.warn?.(`Could not resolve audit university scope: ${err?.message || err}`);
    }
    return resolved;
  }
}

/**
 * Registry backing the static `AdminAuditService.log()` compatibility shim, so legacy
 * call sites (and the API tests) that never went through Nest DI keep working.
 */
let registeredWriter: AuditWriterService | null = null;

export function setAuditWriter(writer: AuditWriterService | null): void {
  registeredWriter = writer;
}

export function getAuditWriter(): AuditWriterService | null {
  return registeredWriter;
}

/** Write without DI access to the service. Resolves once the row is committed. */
export async function writeAuditLog(input: AuditWriteInput): Promise<void> {
  if (!registeredWriter) {
    // eslint-disable-next-line no-console
    console.warn('[audit] AuditWriterService is not initialised; dropping audit entry', input?.action);
    return;
  }
  await registeredWriter.log(input);
}
