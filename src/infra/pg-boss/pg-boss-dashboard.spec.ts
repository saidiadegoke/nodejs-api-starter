import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PgBossDashboardMiddleware } from './pg-boss-dashboard.middleware';

describe('PgBossDashboardMiddleware', () => {
  let middleware: PgBossDashboardMiddleware;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PgBossDashboardMiddleware,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'database.url') return 'postgres://postgres:postgres@localhost:5432/reg_portal_test';
              return null;
            }),
          },
        },
      ],
    }).compile();

    middleware = module.get<PgBossDashboardMiddleware>(PgBossDashboardMiddleware);
  });

  afterEach(async () => {
    await middleware.onModuleDestroy();
  });

  it('should be defined and configure base path correctly', () => {
    expect(middleware).toBeDefined();
    expect(middleware.getBasePath()).toBe('/admin/queues');
  });

  it('should delegate incoming requests and write response headers and body', async () => {
    const mockHandler = Object.assign(
      jest.fn().mockResolvedValue(
        new Response('<h1>pg-boss dashboard</h1>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
      ),
      { close: jest.fn().mockResolvedValue(undefined) },
    );

    jest.spyOn(middleware, 'getHandler').mockResolvedValue(mockHandler);

    const req: any = {
      protocol: 'http',
      headers: { host: 'localhost:3000' },
      get: jest.fn((name: string) => (name === 'host' ? 'localhost:3000' : null)),
      originalUrl: '/admin/queues',
      url: '/admin/queues',
      method: 'GET',
    };

    const res: any = {
      status: jest.fn().mockReturnThis(),
      setHeader: jest.fn(),
      send: jest.fn(),
      end: jest.fn(),
    };

    const next = jest.fn();

    await middleware.use(req, res, next);

    expect(mockHandler).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.setHeader).toHaveBeenCalledWith('content-type', 'text/html');
    expect(res.send).toHaveBeenCalled();
  });
});

