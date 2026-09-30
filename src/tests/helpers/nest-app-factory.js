const { NestFactory } = require('@nestjs/core');
const { ExpressAdapter } = require('@nestjs/platform-express');
const helmet = require('helmet');
const express = require('express');
const { AppModule } = require('../../app.module');
const { LoggerFactory } = require('../../logger');
const { getCorsConfig } = require('../../utils/config/cors.config');

let cachedNestApp = null;
let cachedExpressInstance = null;

async function getNestApp() {
  if (cachedExpressInstance) {
    return cachedExpressInstance;
  }

  const app = await NestFactory.create(AppModule, new ExpressAdapter(), {
    bufferLogs: true,
  });
  const loggerFactory = app.get(LoggerFactory);
  app.useLogger(loggerFactory.create('TestBootstrap'));

  app.use(helmet());
  app.enableCors(getCorsConfig());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Triple-route mount support
  app.use((req, res, next) => {
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

  const expressRoutes = require('../../routes');
  const passport = require('../../utils/config/passport.config');
  app.use(passport.initialize());
  app.use('/', expressRoutes);

  await app.init();
  cachedNestApp = app;
  cachedExpressInstance = app.getHttpAdapter().getInstance();
  return cachedExpressInstance;
}

module.exports = { getNestApp };
