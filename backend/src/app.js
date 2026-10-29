import express from 'express';
import { createWechatRouter } from './integrations/wechat.js';

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
  staticDirectory = null,
  internalModelToken = null,
}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(requestContext);
  app.use(express.json({ limit: '128kb', strict: true }));
  app.use('/integrations/wechat', createWechatRouter({ modelAdapter, searchProvider: taskService?.searchProvider }));

  app.get('/api/capabilities', (_request, response) => response.json({ data: {
    api: true, modelConfigured: Boolean(process.env.ZHIPU_API_KEY), searchProvider: taskService?.searchProvider?.getCapabilities?.().provider ?? null,
    searchConfigured: Boolean(taskService?.searchProvider?.getCapabilities?.().configured),
    entryPoint: process.env.APP_ENTRY_POINT || 'WEB', wechatConfigured: Boolean(process.env.WECHAT_TOKEN),
    records: ['CONVERSATION', 'EMOTION', 'WORRY_OBJECT', 'REHEARSAL_DRAFT', 'DEPOSIT'],
  } }));
  app.get('/health/live', (_request, response) => response.json({ status: 'ok' }));
  app.get('/health/ready', async (_request, response) => {
    try {
      await database.query('SELECT 1');
      response.json({ status: 'ready' });
    } catch {
      response.status(503).json({ error: { code: 'SERVICE_UNAVAILABLE', message: 'Database is unavailable' } });
    }
  });

  app.post('/internal/v1/model/generate', (_request, response) => {
    // This endpoint is intentionally removed from the browser-facing app.
    // Model calls must go through /api/agent/tasks, where Origin, CSRF and
    // AI_PROCESS consent are bound to the session/activity context.
    response.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
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

    app.get('/api/profile/summary', requireAuthentication, async (request, response, next) => {
      try { response.json({ data: await authService.getSummary(request.accessContext), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
    });
    app.get('/api/preferences', requireAuthentication, async (request, response, next) => {
      try { response.json({ data: await authService.getPreferences(request.accessContext), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
    });
    app.patch('/api/preferences', requireAuthentication, async (request, response, next) => {
      try { response.json({ data: await authService.updatePreferences(request.accessContext, request.body), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
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

      app.post('/api/sessions/:id/switch', (request, response, next) => {
        try { response.json({ data: taskService.switchMode(request.accessContext, request.params.id, request.body), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
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
      app.post('/api/saved-queries', requireAuthentication, async (request, response, next) => {
        try { response.status(201).json({ data: await recordService.saveQuery(request.accessContext, request.body), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
      });
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

      app.get('/api/records/:id/deposit', requireAuthentication, async (request, response, next) => {
        try { response.json({ data: await recordService.getDeposit(request.accessContext, request.params.id), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
      });
      for (const [action, method] of [['retrieve', 'retrieveDeposit'], ['postpone', 'postponeDeposit']]) {
        app.post(`/api/records/:id/deposit/${action}`, requireAuthentication, async (request, response, next) => {
          try { response.json({ data: await recordService[method](request.accessContext, request.params.id, request.body), meta: { requestId: request.requestId } }); } catch (error) { next(error); }
        });
      }
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
          taskService?.invalidateRecord?.(request.accessContext, request.params.id);
          response.json({ data, meta: { requestId: request.requestId } });
        } catch (error) {
          next(error);
        }
      });
    }
  }

  if (staticDirectory) app.use(express.static(staticDirectory));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
