import { Injectable, NestMiddleware, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request as ExpressRequest, Response as ExpressResponse, NextFunction } from 'express';

const CONTEXT = 'PgBossDashboard';

export interface DashboardHandler {
  (request: Request): Promise<Response>;
  close(): Promise<void>;
}

@Injectable()
export class PgBossDashboardMiddleware implements NestMiddleware, OnModuleDestroy {
  private readonly logger = new Logger(CONTEXT);
  private handler: DashboardHandler | null = null;
  private handlerPromise: Promise<DashboardHandler | null> | null = null;
  private basePath: string;

  constructor(private readonly configService: ConfigService) {
    this.basePath = process.env.PGBOSS_DASHBOARD_BASE_PATH || '/admin/queues';
  }

  async getHandler(): Promise<DashboardHandler | null> {
    if (this.handler) {
      return this.handler;
    }
    if (this.handlerPromise) {
      return this.handlerPromise;
    }

    this.handlerPromise = (async () => {
      try {
        const databaseUrl =
          process.env.DATABASE_URL ||
          this.configService.get<string>('database.url') ||
          `postgres://${this.configService.get('database.user') || 'postgres'}:${encodeURIComponent(
            this.configService.get('database.password') || '',
          )}@${this.configService.get('database.host') || 'localhost'}:${
            this.configService.get('database.port') || 5432
          }/${this.configService.get('database.name') || 'reg_portal_db'}`;

        const schema = process.env.PGBOSS_SCHEMA || 'pgboss';

        const dynamicImport = new Function('modulePath', 'return import(modulePath)');
        const { createDashboardHandler } = await dynamicImport('@pg-boss/dashboard/handler');

        this.handler = createDashboardHandler({
          databases: [
            {
              url: databaseUrl,
              schema,
              name: 'Registration Portal Queues',
            },
          ],
          basePath: this.basePath,
          auth: Boolean(
            process.env.PGBOSS_DASHBOARD_AUTH_USERNAME && process.env.PGBOSS_DASHBOARD_AUTH_PASSWORD,
          ),
        });

        this.logger.log(`pg-boss dashboard mounted at ${this.basePath}`);
        return this.handler;
      } catch (err: any) {
        this.logger.warn(`Failed to initialize pg-boss dashboard: ${err.message}`);
        return null;
      }
    })();

    return this.handlerPromise;
  }

  async use(req: ExpressRequest, res: ExpressResponse, next: NextFunction) {
    const handler = await this.getHandler();
    if (!handler) {
      return next();
    }


    try {
      const protocol = req.protocol || (req.headers['x-forwarded-proto'] as string) || 'http';
      const host = req.get('host') || 'localhost';
      const fullUrl = `${protocol}://${host}${req.originalUrl || req.url}`;

      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (value !== undefined && value !== null) {
          if (Array.isArray(value)) {
            value.forEach((v) => headers.append(key, String(v)));
          } else {
            headers.set(key, String(value));
          }
        }
      }

      const reqInit: RequestInit = {
        method: req.method,
        headers,
      };

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        if (req.body && typeof req.body === 'object' && Object.keys(req.body).length > 0) {
          const contentType = (req.headers['content-type'] as string) || '';
          if (contentType.includes('application/json')) {
            reqInit.body = JSON.stringify(req.body);
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            reqInit.body = new URLSearchParams(req.body as any).toString();
          } else {
            reqInit.body = req.body;
          }
        } else if (req.readable) {
          reqInit.body = req as any;
          (reqInit as any).duplex = 'half';
        }
      }

      const webRequest = new Request(fullUrl, reqInit);
      const webResponse = await handler(webRequest);


      res.status(webResponse.status);
      webResponse.headers.forEach((val, key) => {
        res.setHeader(key, val);
      });

      if (!webResponse.body) {
        res.end();
        return;
      }

      const arrayBuffer = await webResponse.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
    } catch (err: any) {
      this.logger.error(`Error handling dashboard request: ${err.message}`, err.stack);
      next(err);
    }
  }

  async onModuleDestroy() {
    if (this.handler) {
      try {
        await this.handler.close();
      } catch (err: any) {
        this.logger.warn(`Error closing pg-boss dashboard handler: ${err.message}`);
      }
    }
  }

  getBasePath(): string {
    return this.basePath;
  }
}
