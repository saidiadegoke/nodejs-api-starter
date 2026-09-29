import type { Request, Response, NextFunction } from 'express';
import { CommodLogger } from './commod-logger.service';

const SLOW_REQUEST_THRESHOLD_MS = 5000;

function shouldSkip(method: string, path: string): boolean {
  return method === 'OPTIONS' || path === '/' || path.endsWith('/health');
}

export function registerHttpRequestLogging(
  req: Request,
  res: Response,
  next: NextFunction,
  logger: CommodLogger,
): void {
  const startTime = Date.now();
  res.on('finish', () => {
    const path = (req.baseUrl || '') + (req.path || '');
    if (shouldSkip(req.method, path)) return;
    const durationMs = Date.now() - startTime;
    const message = `[HTTP] ${req.method} ${path} ${res.statusCode} ${durationMs}ms`;
    if (durationMs >= SLOW_REQUEST_THRESHOLD_MS || res.statusCode >= 500) {
      logger.warn(message);
    } else {
      logger.log(message);
    }
  });
  next();
}

