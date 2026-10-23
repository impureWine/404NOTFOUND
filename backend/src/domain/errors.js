export class DomainError extends Error {
  constructor(code, message, details = undefined) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = details;
  }
}

export class ConflictError extends DomainError {
  constructor(message = 'The resource changed or the request conflicts with existing state') {
    super('CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class NotFoundError extends DomainError {
  constructor(message = 'Resource not found') {
    super('NOT_FOUND', message);
    this.name = 'NotFoundError';
  }
}

export class InvalidInputError extends DomainError {
  constructor(message, details = undefined) {
    super('INVALID_INPUT', message, details);
    this.name = 'InvalidInputError';
  }
}

export class UpstreamError extends DomainError {
  constructor(code, message) {
    super(code, message);
    this.name = 'UpstreamError';
  }
}
