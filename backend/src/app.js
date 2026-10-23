import express from 'express';

export function createApp({ database }) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb', strict: true }));

  app.get('/health/live', (_request, response) => {
    response.set('Cache-Control', 'no-store').json({ status: 'ok' });
  });

  app.get('/health/ready', async (_request, response) => {
    try {
      await database.query('SELECT 1');
      response.set('Cache-Control', 'no-store').json({ status: 'ready' });
    } catch {
      response.status(503).set('Cache-Control', 'no-store').json({
        error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' },
      });
    }
  });

  return app;
}
