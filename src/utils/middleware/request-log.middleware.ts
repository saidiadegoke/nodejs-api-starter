import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { DataSource } from 'typeorm';
import { CommodLogger } from '../../logger/commod-logger.service';
import { redactBody } from '../utils/redact';

const SLOW_THRESHOLD_MS = 3000;

@Injectable()
export class RequestLogMiddleware implements NestMiddleware {
  constructor(
    private readonly logger: CommodLogger,
    private readonly dataSource?: DataSource,
  ) {}

  use(req: Request, res: Response, next: NextFunction) {
    const startTime = Date.now();

    // Capture response body for error diagnostics
    const originalJson = res.json.bind(res);
    let responseBody: any = null;
    res.json = function (body: any) {
      responseBody = body;
      return originalJson(body);
    };

    res.on('finish', () => {
      const durationMs = Date.now() - startTime;
      const statusCode = res.statusCode;
      const isError = statusCode >= 400;
      const isSlow = durationMs >= SLOW_THRESHOLD_MS;

      // Structured log via CommodLogger
      const logMsg = `[HTTP] ${req.method} ${req.path} ${statusCode} ${durationMs}ms [${req.id || 'no-id'}]`;
      if (isSlow || statusCode >= 500) {
        this.logger.warn(logMsg);
      } else {
        this.logger.log(logMsg);
      }

      // DB-backed request logging if DB connection is active
      if (this.dataSource && this.dataSource.isInitialized) {
        this.dataSource
          .query(
            `INSERT INTO request_counters (bucket, total_requests, success_requests, error_requests, slow_requests)
             VALUES (date_trunc('hour', NOW()), 1, $1, $2, $3)
             ON CONFLICT (bucket) DO UPDATE SET
               total_requests = request_counters.total_requests + 1,
               success_requests = request_counters.success_requests + $1,
               error_requests = request_counters.error_requests + $2,
               slow_requests = request_counters.slow_requests + $3`,
            [isError ? 0 : 1, isError ? 1 : 0, isSlow ? 1 : 0],
          )
          .catch((err: any) => {
            this.logger.error('Failed to increment request counter:', { error: err.message });
          });

        if (!isError && !isSlow) return;

        // Redact sensitive fields before persisting
        const sanitizedBody = redactBody(req.body);

        const entry = {
          method: req.method,
          path: req.originalUrl || req.path,
          status_code: statusCode,
          duration_ms: durationMs,
          request_id: req.id,
          user_id: (req as any).user?.user_id || null,
          ip_address: req.ip || (req.socket && req.socket.remoteAddress),
          user_agent: req.get('user-agent'),
          request_body: sanitizedBody ? JSON.stringify(sanitizedBody) : null,
          request_query:
            req.query && Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : null,
          response_body: responseBody ? JSON.stringify(responseBody) : null,
          error_message: responseBody?.message || null,
          error_stack: null,
        };

        this.dataSource
          .query(
            `INSERT INTO request_logs (
              method, path, status_code, duration_ms, request_id, user_id,
              ip_address, user_agent, request_body, request_query, response_body,
              error_message, error_stack, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
            [
              entry.method,
              entry.path,
              entry.status_code,
              entry.duration_ms,
              entry.request_id,
              entry.user_id,
              entry.ip_address,
              entry.user_agent,
              entry.request_body,
              entry.request_query,
              entry.response_body,
              entry.error_message,
              entry.error_stack,
            ],
          )
          .catch((err: any) => {
            this.logger.error('Failed to insert request log:', { error: err.message });
          });
      }
    });

    next();
  }
}
