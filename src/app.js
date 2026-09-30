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

getApp().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to initialize Nest test app:', err);
});

module.exports = server;
