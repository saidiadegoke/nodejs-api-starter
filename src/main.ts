import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import * as express from 'express';
import { AppModule } from './app.module';
import { LoggerFactory } from './logger';
import { getCorsConfig } from './shared/config/cors.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });

  const loggerFactory = app.get(LoggerFactory);
  const logger = loggerFactory.create('Bootstrap');
  app.useLogger(logger);

  // Security headers
  app.use(helmet());

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
        name: 'JWT',
        description: 'Enter JWT access token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('Auth', 'Authentication, registration wizards, OTP, and password recovery')
    .addTag('Users', 'User management, profile updates, preferences, and activity auditing')
    .addTag('API Keys', 'Programmatic API key provisioning and revocation')
    .addTag('App', 'System runtime information and health status')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);
  logger.log(`🚀 NestJS server running on port ${port} (environment: ${process.env.NODE_ENV || 'development'})`);
  logger.log(`📚 Swagger documentation available at http://localhost:${port}/docs`);
}

if (require.main === module) {
  bootstrap();
}

export { bootstrap };
