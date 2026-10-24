import express from 'express';

function modelHttpStatus(result) {
  if (result.status === 'success') {
    return 200;
  }
  switch (result.error?.code) {
    case 'INVALID_REQUEST':
      return 400;
    case 'MODEL_RATE_LIMITED':
      return 429;
    case 'MODEL_TIMEOUT':
      return 504;
    default:
      return 503;
  }
}

function unavailableModelResponse(requestId) {
  return {
    contract_version: '1.1',
    request_id: typeof requestId === 'string' ? requestId : 'unknown',
    status: 'error',
    error: {
      code: 'MODEL_UNAVAILABLE',
      retryable: true,
      user_message: '模型服务暂时不可用。',
      internal_message: 'MODEL_UNAVAILABLE',
    },
    model_info: { provider: 'zhipu', model: 'glm-4.7-flash', mock: false },
    timing: { latency_ms: 0, attempts: 0 },
  };
}

export function createApp({ database, modelAdapter = null }) {
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

  app.post('/internal/v1/model/generate', async (request, response) => {
    let result;
    try {
      result = modelAdapter
        ? await modelAdapter.respond(request.body)
        : unavailableModelResponse(request.body?.request_id);
    } catch {
      result = unavailableModelResponse(request.body?.request_id);
    }
    response
      .status(modelHttpStatus(result))
      .set('Cache-Control', 'no-store')
      .json(result);
  });

  return app;
}
