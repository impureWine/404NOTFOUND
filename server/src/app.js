import express from 'express';
import { errorHandler, noStore, notFound, requestContext } from './http.js';
import { createAuthRouter } from './routes/auth.routes.js';
import { createHealthRouter } from './routes/health.routes.js';
import { createProfileRouter } from './routes/profile.routes.js';

export const createApp = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '128kb', strict: true }));
  app.use(requestContext);
  app.use('/api', noStore);
  app.use('/api', createHealthRouter());
  app.use('/api/auth', createAuthRouter());
  app.use('/api', createProfileRouter());
  app.use(notFound);
  app.use(errorHandler);
  return app;
};
