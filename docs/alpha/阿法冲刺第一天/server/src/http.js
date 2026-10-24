import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

export class ApiError extends Error {
  constructor(status, code, message, options = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.fields = options.fields;
    this.retryAfterSeconds = options.retryAfterSeconds;
  }
}

export const requestContext = (request, response, next) => {
  const supplied = request.get('X-Request-Id');
  request.requestId = /^[0-9a-f-]{36}$/i.test(supplied ?? '') ? supplied : randomUUID();
  response.set('X-Request-Id', request.requestId);
  next();
};

export const noStore = (_request, response, next) => {
  response.set('Cache-Control', 'no-store');
  next();
};

export const validateBody = (schema) => (request, _response, next) => {
  const result = schema.safeParse(request.body);
  if (result.success) {
    request.validatedBody = result.data;
    next();
    return;
  }

  next(new ApiError(400, 'INVALID_INPUT', '请求字段不符合接口契约', {
    fields: result.error.issues.map((issue) => ({
      path: issue.path.join('.') || '$',
      rule: issue.message,
    })),
  }));
};

export const notFound = (request, _response, next) => {
  next(new ApiError(404, 'NOT_FOUND', `接口不存在：${request.method} ${request.path}`));
};

export const errorHandler = (error, request, response, _next) => {
  const apiError = error instanceof ApiError
    ? error
    : error instanceof ZodError
      ? new ApiError(400, 'INVALID_INPUT', '请求字段不符合接口契约')
      : new ApiError(503, 'SERVICE_UNAVAILABLE', '服务暂时不可用');

  if (apiError.retryAfterSeconds) response.set('Retry-After', String(apiError.retryAfterSeconds));
  response.status(apiError.status).json({
    error: {
      code: apiError.code,
      message: apiError.message,
      ...(apiError.fields ? { fields: apiError.fields } : {}),
      ...(apiError.retryAfterSeconds ? { retryAfterSeconds: apiError.retryAfterSeconds } : {}),
    },
    meta: { requestId: request.requestId },
  });
};

export const unavailableHandler = (_request, _response, next) => {
  next(new ApiError(503, 'SERVICE_UNAVAILABLE', '接口骨架已注册，业务服务尚未接入'));
};
