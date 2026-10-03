import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { LoggerFactory } from './logger';
import { getCorsConfig } from './utils/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });

  const loggerFactory = app.get(LoggerFactory);
  const logger = loggerFactory.create('Bootstrap');
  app.useLogger(logger);

  // Security headers (disable strict CSP so Swagger & pg-boss dashboard assets render smoothly)
  app.use(
    helmet({
      contentSecurityPolicy: false,
    }),
  );

  // CORS matching Express behavior
  app.enableCors(getCorsConfig());

  // Request body parsing limits
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Support triple-route mount: '/', '/api/v1', '/api'
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.url.startsWith('/api/v1/')) {
      req.url = req.url.slice('/api/v1'.length);
    } else if (req.url === '/api/v1') {
      req.url = '/';
    } else if (req.url.startsWith('/api/')) {
      req.url = req.url.slice('/api'.length);
    } else if (req.url === '/api') {
      req.url = '/';
    }
    next();
  });

  // Swagger OpenAPI Documentation
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Registration Portal API')
    .setDescription('REST API documentation for the Registration Portal platform.')
    .setVersion('1.0.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter JWT access token',
        in: 'header',
      },
    )
    .addTag('Auth', 'Authentication, registration wizards, OTP, and password recovery')
    .addTag('Users', 'User management, profile updates, preferences, and activity auditing')
    .addTag('API Keys', 'Programmatic API key provisioning and revocation')
    .addTag('App', 'System runtime information and health status')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  const swaggerCustomOptions = {
    swaggerOptions: {
      persistAuthorization: true,
    },
  };
  SwaggerModule.setup('docs', app, document, swaggerCustomOptions);
  SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  const dashboardPath = process.env.PGBOSS_DASHBOARD_BASE_PATH || '/admin/queues';
  logger.log(`🚀 NestJS server running on port ${port} (environment: ${process.env.NODE_ENV || 'development'})`);
  logger.log(`📚 Swagger documentation available at http://localhost:${port}/docs`);
  logger.log(`📊 pg-boss dashboard available at http://localhost:${port}${dashboardPath}`);

}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };
