/**
 * Logger utility with optional JSON output and optional file persistence with rotation.
 * - Set LOG_FORMAT=json for one-JSON-object-per-line (parseable by Datadog, CloudWatch, etc.).
 * - Set LOG_DIR to persist logs to files with daily rotation and automatic deletion of old logs.
 */
const path = require('path');
const fs = require('fs');
const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const LOG_FORMAT_JSON = process.env.LOG_FORMAT === 'json';
const LOG_DIR = process.env.LOG_DIR || '';
const LOG_MAX_DAYS = process.env.LOG_MAX_DAYS || '14';
const LOG_DATE_PATTERN = process.env.LOG_DATE_PATTERN || 'YYYY-MM-DD';

/** Winston level: LOG_LEVEL wins; else debug in development or when LOG_DEBUG=true; else info */
function resolveLogLevel() {
  const explicit = process.env.LOG_LEVEL && String(process.env.LOG_LEVEL).trim();
  if (explicit) {
    return String(process.env.LOG_LEVEL).trim().toLowerCase();
  }
  if (process.env.NODE_ENV === 'development' || process.env.LOG_DEBUG === 'true') {
    return 'debug';
  }
  return 'info';
}

function formatEntry(level, message, meta = {}) {
  const entry = {
    level,
    timestamp: new Date().toISOString(),
    message: typeof message === 'string' ? message : String(message),
    ...(typeof meta === 'object' && meta !== null ? meta : {}),
  };
  if (LOG_FORMAT_JSON) {
    return JSON.stringify(entry);
  }
  const metaStr = Object.keys(entry).length > 3 ? ` ${JSON.stringify(meta)}` : '';
  return `[${level}] ${entry.timestamp}: ${entry.message}${metaStr}`;
}

function buildWinstonFormat() {
  return winston.format.printf((info) => {
    const { level, message, ...meta } = info;
    return formatEntry(level, message, Object.keys(meta).length ? meta : {});
  });
}

const consoleTransport = new winston.transports.Console({
  format: buildWinstonFormat(),
  stderrLevels: ['error'],
});

const transports = [consoleTransport];

if (LOG_DIR) {
  try {
    const dir = path.isAbsolute(LOG_DIR) ? LOG_DIR : path.resolve(process.cwd(), LOG_DIR);
    fs.mkdirSync(dir, { recursive: true });

    const maxFiles = LOG_MAX_DAYS.match(/^\d+$/) ? `${LOG_MAX_DAYS}d` : LOG_MAX_DAYS;

    transports.push(
      new DailyRotateFile({
        dirname: dir,
        filename: 'app-%DATE%.log',
        datePattern: LOG_DATE_PATTERN,
        maxFiles,
        format: buildWinstonFormat(),
        level: 'debug',
      })
    );

    transports.push(
      new DailyRotateFile({
        dirname: dir,
        filename: 'error-%DATE%.log',
        datePattern: LOG_DATE_PATTERN,
        maxFiles,
        format: buildWinstonFormat(),
        level: 'error',
      })
    );
  } catch (err) {
    console.error('[Logger] Failed to add file transport:', err.message);
  }
}

const winstonLogger = winston.createLogger({
  level: resolveLogLevel(),
  transports,
});

const logger = {
  info: (message, meta = {}) => {
    winstonLogger.info(message, meta);
  },

  error: (message, meta = {}) => {
    winstonLogger.error(message, meta);
  },

  warn: (message, meta = {}) => {
    winstonLogger.warn(message, meta);
  },

  debug: (message, meta = {}) => {
    winstonLogger.debug(message, meta);
  },

  /** Log a request for monitoring dashboards (method, path, statusCode, durationMs, requestId). */
  request: (meta) => {
    const message = meta.message || `${meta.method || ''} ${meta.path || ''}`.trim() || 'request';
    winstonLogger.info(message, meta);
  },
};

module.exports = { logger };
