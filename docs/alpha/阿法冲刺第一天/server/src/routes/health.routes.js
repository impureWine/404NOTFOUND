import { Router } from 'express';

export const createHealthRouter = () => {
  const router = Router();
  router.get('/health', (request, response) => {
    response.json({
      data: {
        status: 'ok',
        service: '404notfound-api',
        version: '0.1.0',
      },
      meta: { requestId: request.requestId },
    });
  });
  return router;
};
