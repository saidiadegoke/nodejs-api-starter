import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

const ALLOWED_ORIGIN_PATTERNS: RegExp[] = [
  /^https?:\/\/localhost(:\d+)?$/,
  /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.vercel\.app$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.morgengreen\.com$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.morgengreen\.cloud$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.jupeb\.edu\.ng$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.ngrok-free\.app$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.ngrok\.app$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.ngrok\.io$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.loca\.lt$/,
  /^https?:\/\/[a-zA-Z0-9-_.]+\.trycloudflare\.com$/,
];

export function getCorsConfig(): CorsOptions {
  const envOrigins = [
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
    process.env.FRONTEND_URL,
    process.env.INSTITUTION_FRONTEND_URL,
  ]
    .filter((url): url is string => Boolean(url && url.trim().length > 0))
    .map((url) => url.trim().replace(/\/$/, ''));

  const defaultOrigins = [
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:4070',
    'http://localhost:5173',
    'http://localhost:5270',
    'https://crp-theta.vercel.app',
    'https://crp-admin.morgengreen.com',
    'https://crp-institution.morgengreen.com',
  ];

  const allowedOrigins = new Set<string>([...defaultOrigins, ...envOrigins]);

  return {
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        return callback(null, true);
      }

      const normalizedOrigin = origin.trim().replace(/\/$/, '');

      // Allow wildcard in environment
      if (process.env.CORS_ORIGIN === '*' || allowedOrigins.has('*')) {
        return callback(null, true);
      }

      // Exact match in configured set
      if (allowedOrigins.has(normalizedOrigin)) {
        return callback(null, true);
      }

      // Pattern match (e.g. vercel preview domains, ngrok tunnels, subdomains)
      const isPatternMatched = ALLOWED_ORIGIN_PATTERNS.some((pattern) =>
        pattern.test(normalizedOrigin),
      );

      if (isPatternMatched) {
        return callback(null, true);
      }

      // In development or when origin contains ngrok/vercel, allow gracefully
      if (process.env.NODE_ENV !== 'production' || normalizedOrigin.includes('ngrok') || normalizedOrigin.includes('vercel')) {
        return callback(null, true);
      }

      // Reject non-matching origins cleanly
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    optionsSuccessStatus: 200,
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'client-type',
      'Accept',
      'X-Requested-With',
      'x-api-key',
      'x-request-id',
      'X-Request-ID',
      'X-Forwarded-For',
      'Origin',
      'ngrok-skip-browser-warning',
      'Cache-Control',
      'Pragma',
      'baggage',
      'sentry-trace',
    ],
  };
}
