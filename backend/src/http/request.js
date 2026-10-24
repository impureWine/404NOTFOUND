import { randomUUID } from 'node:crypto';

import { DomainError } from '../domain/errors.js';

const STATUS_BY_CODE = {
  INVALID_INPUT: 400,
  AUTH_REQUIRED: 401,
  ACCESS_DENIED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
};

export function requestContext(request, response, next) {
  const supplied = request.get('X-Request-Id');
  request.requestId = /^[0-9a-f-]{36}$/i.test(supplied ?? '') ? supplied : randomUUID();
  response.set('X-Request-Id', request.requestId);
  response.set('Cache-Control', 'no-store');
  next();
}

export function parseCookies(header = '') {
  return Object.fromEntries(
    header.split(';').map((part) => part.trim()).filter(Boolean).map((part) => {
      const separator = part.indexOf('=');
      return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
    }),
  );
}

export function sessionCookie(value, secure = false) {
  const name = secure ? '__Host-session' : 'session';
  return [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', ...(secure ? ['Secure'] : [])].join('; ');
}

export function clearSessionCookie(secure = false) {
  return `${sessionCookie('', secure)}; Max-Age=0`;
}

export function readSessionToken(cookies) {
  return cookies['__Host-session'] ?? cookies.session;
}

export function createSecurityMiddleware({ authService, appOrigin }) {
  return async (request, _response, next) => {
    try {
      const cookies = parseCookies(request.get('cookie'));
      request.accessContext = await authService.resolveContext(readSessionToken(cookies));
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        if (request.get('origin') !== appOrigin) {
          const error = new Error('Origin 校验失败');
          error.code = 'ACCESS_DENIED';
          throw error;
        }
        authService.verifyCsrf(request.accessContext, request.get('X-CSRF-Token'));
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

export function requireAuthentication(request, _response, next) {
  if (!request.accessContext?.accountId) {
    const error = new Error('需要登录');
    error.code = 'AUTH_REQUIRED';
    next(error);
    return;
  }
  next();
}

export function notFound(request, _response, next) {
  const error = new Error(`接口不存在：${request.method} ${request.path}`);
  error.code = 'NOT_FOUND';
  next(error);
}

export function errorHandler(error, request, response, _next) {
  const code = error instanceof DomainError ? error.code : error.code ?? 'SERVICE_UNAVAILABLE';
  const status = STATUS_BY_CODE[code] ?? 500;
  response.status(status).json({
    error: {
      code,
      message: status === 500 ? '服务内部错误' : error.message,
      ...(error.details ? { fields: error.details } : {}),
    },
    meta: { requestId: request.requestId },
  });
}
