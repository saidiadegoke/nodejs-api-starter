import { Injectable, LoggerService } from '@nestjs/common';
import * as path from 'path';
import * as fs from 'fs';
import * as winston from 'winston';
import DailyRotateFile = require('winston-daily-rotate-file');

export interface RequestLogMeta {
  method?: string;
  path?: string;
  statusCode?: number;
  durationMs?: number;
  requestId?: string;
  message?: string;
  [key: string]: any;
}

@Injectable()
export class AppLoggerService implements LoggerService {
  private readonly winstonLogger: winston.Logger;
  private readonly isJsonFormat: boolean;

  constructor() {
    this.isJsonFormat = process.env.LOG_FORMAT === 'json';
    const logDir = process.env.LOG_DIR || '';
    const logMaxDays = process.env.LOG_MAX_DAYS || '14';
    const logDatePattern = process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD';

    const formatEntry = (level: string, message: any, meta: Record<string, any> = {}) => {
      const entry: Record<string, any> = {
        level,
        timestamp: new Date().toISOString(),
        message: typeof message === 'string' ? message : String(message),
        ...(typeof meta === 'object' && meta !== null ? meta : {}),
      };
      if (this.isJsonFormat) {
        return JSON.stringify(entry);
      }
      const metaStr = Object.keys(entry).length > 3 ? ` ${JSON.stringify(meta)}` : '';
      return `[${level}] ${entry.timestamp}: ${entry.message}${metaStr}`;
    };

    const buildWinstonFormat = () => {
      return winston.format.printf((info) => {
        const { level, message, ...meta } = info;
        return formatEntry(level, message, Object.keys(meta).length ? meta : {});
      });
    };

    const transports: winston.transport[] = [
      new winston.transports.Console({
        format: buildWinstonFormat(),
        stderrLevels: ['error'],
      }),
    ];

    if (logDir) {
      try {
        const dir = path.isAbsolute(logDir) ? logDir : path.resolve(process.cwd(), logDir);
        fs.mkdirSync(dir, { recursive: true });

        const maxFiles = logMaxDays.match(/^\d+$/) ? `${logMaxDays}d` : logMaxDays;

        transports.push(
          new DailyRotateFile({
            dirname: dir,
            filename: 'app-%DATE%.log',
            datePattern: logDatePattern,
            maxFiles,
            format: buildWinstonFormat(),
            level: 'debug',
          }),
        );

        transports.push(
          new DailyRotateFile({
            dirname: dir,
            filename: 'error-%DATE%.log',
            datePattern: logDatePattern,
            maxFiles,
            format: buildWinstonFormat(),
            level: 'error',
          }),
        );
      } catch (err: any) {
        console.error('[Logger] Failed to add file transport:', err.message);
      }
    }

    this.winstonLogger = winston.createLogger({
      level: this.resolveLogLevel(),
      transports,
    });
  }

  private resolveLogLevel(): string {
    const explicit = process.env.LOG_LEVEL && String(process.env.LOG_LEVEL).trim();
    if (explicit) {
      return String(process.env.LOG_LEVEL).trim().toLowerCase();
    }
    if (process.env.NODE_ENV === 'development' || process.env.LOG_DEBUG === 'true') {
      return 'debug';
    }
    return 'info';
  }

  log(message: any, ...optionalParams: any[]) {
    this.info(message, optionalParams.length > 0 ? { params: optionalParams } : {});
  }

  info(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.info(message, meta);
  }

  error(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.error(message, meta);
  }

  warn(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.warn(message, meta);
  }

  debug(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.debug(message, meta);
  }

  verbose(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.verbose(message, meta);
  }

  fatal(message: any, meta: Record<string, any> = {}) {
    this.winstonLogger.error(message, meta);
  }

  /**
   * Structured request logging for dashboards (method, path, statusCode, durationMs, requestId).
   */
  request(meta: RequestLogMeta) {
    const message = meta.message || `${meta.method || ''} ${meta.path || ''}`.trim() || 'request';
    this.winstonLogger.info(message, meta);
  }
}

export const appLogger = new AppLoggerService();
