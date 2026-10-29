import { timingSafeEqual } from 'node:crypto';

import express from 'express';

import { NamingCard } from './ai/naming-card-router.js';
import {
  clearSessionCookie,
  createSecurityMiddleware,
  errorHandler,
  notFound,
  parseCookies,
  readSessionToken,
  requestContext,
  requireAuthentication,
  sessionCookie,
} from './http/request.js';

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
    case 'MODEL_CANCELLED':
      return 499;
    case 'EMPTY_MODEL_OUTPUT':
    case 'INVALID_MODEL_OUTPUT':
    case 'CONTENT_REJECTED':
      return 502;
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

function hasInternalModelAccess(request, expectedToken) {
  if (typeof expectedToken !== 'string' || expectedToken.length < 16) return false;
  const authorization = request.get('authorization') ?? '';
  if (!authorization.startsWith('Bearer ')) return false;
  const suppliedToken = authorization.slice('Bearer '.length);
  const supplied = Buffer.from(suppliedToken);
  const expected = Buffer.from(expectedToken);
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

export function createApp({
  database,
  modelAdapter = null,
  authService,
  taskService,
  trainingService,
  recordService,
  consentService,
  appOrigin = 'http://127.0.0.1:5173',
  secureCookies = false,
  internalModelToken = null,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(express.json({ limit: '128kb', strict: true }));

  app.get('/health/live', (_request, response) => response.json({ status: 'ok' }));
  app.get('/health/ready', async (_request, response) => {
    try {
      await database.query('SELECT 1');
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' } });
    }
  });

  app.post('/internal/v1/model/generate', async (request, response, next) => {
    if (!hasInternalModelAccess(request, internalModelToken)) {
      response.status(403).json({
        error: { code: 'ACCESS_DENIED', message: '内部模型入口拒绝访问' },
        meta: { requestId: request.requestId },
      });
      return;
    }

    if (authService) {
      try {
        const cookies = parseCookies(request.get('cookie'));
        request.accessContext = await authService.resolveContext(readSessionToken(cookies));
      } catch (error) {
        next(error);
        return;
      }
      if (!request.accessContext?.accountId) {
        requireAuthentication(request, response, next);
        return;
      }
    }
    const controller = new AbortController();
    const abort = () => controller.abort();
    request.once('aborted', abort);
    response.once('close', abort);
    let result;
    try {
      result = modelAdapter
        ? await modelAdapter.respond(request.body, { signal: controller.signal })
        : unavailableModelResponse(request.body?.request_id);
    } catch {
      result = unavailableModelResponse(request.body?.request_id);
    } finally {
      request.off('aborted', abort);
      response.off('close', abort);
    }
    response
      .status(modelHttpStatus(result))
      .set('Cache-Control', 'no-store')
      .json(result);
  });

  if (authService) {
    app.get('/api/auth/context', async (request, response, next) => {
      try {
        const cookies = parseCookies(request.get('cookie'));
        const existing = await authService.resolveContext(readSessionToken(cookies));
        const context = await authService.createContext(existing?.accountId ?? null, existing?.entryPointId ?? null);
        if (existing) await authService.revokeSession(existing.sessionId);
        if (existing) taskService?.invalidateContext?.(existing);
        response.set('Set-Cookie', sessionCookie(context.sessionToken, secureCookies)).json({
          data: {
            authenticated: Boolean(context.accountId),
            csrfToken: context.csrfToken,
            ...(context.accountId ? { expiresAt: context.expiresAt.toISOString() } : {}),
          },
          meta: { requestId: request.requestId },
        });
      } catch (error) {
        next(error);
      }
    });

    app.use('/api', createSecurityMiddleware({ authService, appOrigin }));

    app.post('/api/auth/register', async (request, response, next) => {
      try {
        const data = await authService.register(request.body);
        response.status(201).json({ data, meta: { requestId: request.requestId } });
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/auth/login', async (request, response, next) => {
      try {
        const { context, ...data } = await authService.login(request.body, request.accessContext);
        taskService?.invalidateContext?.(request.accessContext);
        response.set('Set-Cookie', sessionCookie(context.sessionToken, secureCookies)).json({
          data: { ...data, expiresAt: context.expiresAt.toISOString() },
          meta: { requestId: request.requestId },
        });
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/auth/logout', async (request, response, next) => {
      try {
        await authService.logout(request.accessContext);
        taskService?.invalidateContext?.(request.accessContext);
        response.set('Set-Cookie', clearSessionCookie(secureCookies)).status(204).end();
      } catch (error) {
        next(error);
      }
    });

    app.post('/api/auth/change-password', requireAuthentication, async (request, response, next) => {
      try {
        await authService.changePassword(request.accessContext.accountId, request.body);
        taskService?.invalidateAccount?.(request.accessContext.accountId);
        response.set('Set-Cookie', clearSessionCookie(secureCookies)).status(204).end();
      } catch (error) {
        next(error);
      }
    });

    app.get('/api/profile', requireAuthentication, async (request, response, next) => {
      try {
        const data = await authService.getProfile(request.accessContext.accountId);
        response.json({ data, meta: { requestId: request.requestId } });
      } catch (error) {
        next(error);
      }
    });

    app.patch('/api/profile', requireAuthentication, async (request, response, next) => {
      try {
        const data = await authService.updateProfile(request.accessContext.accountId, request.body);
        response.json({ data, meta: { requestId: request.requestId } });
      } catch (error) {
        next(error);
      }
    });

    if (consentService) {
      app.post('/api/consents', (request, response, next) => {
        try {
          const data = consentService.create(request.accessContext, request.body);
          response.status(201).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/consents/:id/revoke', (request, response, next) => {
        try {
          const data = consentService.revoke(request.accessContext, request.params.id);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });
    }

    app.post('/api/naming-card/route', (request, response, next) => {
      try {
        const data = NamingCard.select(request.body);
        response.json({ data, meta: { requestId: request.requestId } });
      } catch (error) {
        next(error);
      }
    });

    if (taskService) {
      app.post('/api/sessions', (request, response, next) => {
        try {
          const data = taskService.createSession(request.accessContext, request.body);
          response.status(201).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/sessions/:id/actions', (request, response, next) => {
        try {
          const data = taskService.action(request.accessContext, request.params.id, request.body);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/search/tasks', (request, response, next) => {
        try {
          const data = taskService.createSearchTask(request.accessContext, request.body);
          response.status(202).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/agent/tasks', (request, response, next) => {
        try {
          const data = taskService.createAgentTask(request.accessContext, request.body);
          response.status(202).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.get('/api/agent/tasks/:requestId', (request, response, next) => {
        try {
          const data = taskService.getAgentTask(request.accessContext, request.params.requestId);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/agent/tasks/:requestId/cancel', (request, response, next) => {
        try {
          const data = taskService.cancelAgentTask(request.accessContext, request.params.requestId);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.get('/api/search/tasks/:requestId', (request, response, next) => {
        try {
          const data = taskService.getSearchTask(request.accessContext, request.params.requestId);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/search/tasks/:requestId/cancel', (request, response, next) => {
        try {
          const data = taskService.cancelSearchTask(request.accessContext, request.params.requestId);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });
    }

    if (trainingService) {
      app.post('/api/trainings', (request, response, next) => {
        try {
          const data = trainingService.start(request.accessContext, request.body);
          response.status(201).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.get('/api/trainings/:id', (request, response, next) => {
        try {
          const data = trainingService.get(request.accessContext, request.params.id);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/trainings/:id/actions', (request, response, next) => {
        try {
          const data = trainingService.action(request.accessContext, request.params.id, request.body);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });
    }

    if (recordService) {
      app.post('/api/records', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.create(request.accessContext, request.body);
          response.status(201).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.get('/api/records', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.list(request.accessContext, request.query);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.patch('/api/records/:id', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.update(request.accessContext, request.params.id, request.body);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) { next(error); }
      });

      app.get('/api/records/:id', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.get(request.accessContext, request.params.id);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/records/:id/clear-confirmations', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.issueClearConfirmation(request.accessContext, request.params.id, request.body);
          response.status(201).json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });

      app.post('/api/records/:id/clear', requireAuthentication, async (request, response, next) => {
        try {
          const data = await recordService.clear(request.accessContext, request.params.id, request.body);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });
    }
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
