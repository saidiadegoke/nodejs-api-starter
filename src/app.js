const express = require('express');
const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const { AppModule } = require('./app.module');

const server = express();
let appPromise = null;

async function getApp() {
  if (!appPromise) {
    appPromise = (async () => {
      server.use(express.json({ limit: '10mb' }));
      server.use(express.urlencoded({ extended: true, limit: '10mb' }));
      server.use((req, res, next) => {
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

      const app = await NestFactory.create(AppModule, new ExpressAdapter(server), {
        logger: false,
      });
      await app.init();
      return app;
    })();
  }
  return appPromise;
}

if (require.main === module) {
  const port = process.env.PORT || 3000;
  getApp().then(async (app) => {
    try {
      const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
      const swaggerConfig = new DocumentBuilder()
        .setTitle('Registration Portal API')
        .setDescription('REST API documentation for the Registration Portal platform.')
        .setVersion('1.0.0')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', description: 'Enter JWT access token', in: 'header' }, 'JWT')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', description: 'Enter JWT access token', in: 'header' }, 'JWT-auth')
        .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT', name: 'Authorization', description: 'Enter JWT access token', in: 'header' })
        .addTag('Auth', 'Authentication, registration wizards, OTP, and password recovery')
        .addTag('Users', 'User management, profile updates, preferences, and activity auditing')
        .addTag('API Keys', 'Programmatic API key provisioning and revocation')
        .addTag('App', 'System runtime information and health status')
        .build();

      const document = SwaggerModule.createDocument(app, swaggerConfig);
      const swaggerCustomOptions = { swaggerOptions: { persistAuthorization: true } };
      SwaggerModule.setup('docs', app, document, swaggerCustomOptions);
      SwaggerModule.setup('api/docs', app, document, swaggerCustomOptions);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('Swagger setup skipped or deferred:', e.message);
    }

    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`🚀 NestJS server (app.js runner) running on port ${port}`);
      // eslint-disable-next-line no-console
      console.log(`📚 Swagger documentation available at http://localhost:${port}/docs`);
    });
  });
}

module.exports = server;
