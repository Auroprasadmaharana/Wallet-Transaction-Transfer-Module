export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly errorCode: string;
  public readonly details?: unknown;

  constructor(message: string, statusCode = 500, errorCode = 'INTERNAL_ERROR', details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = true;
    this.details = details;

    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class BadRequestError extends AppError {
  constructor(message = 'Bad request', details?: unknown) {
    super(message, 400, 'BAD_REQUEST', details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized access') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden access') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict') {
    super(message, 409, 'CONFLICT');
  }
}

export class UnprocessableEntityError extends AppError {
  constructor(message = 'Unprocessable entity', details?: unknown) {
    super(message, 422, 'UNPROCESSABLE_ENTITY', details);
  }
}

export class InsufficientFundsError extends AppError {
  constructor(message = 'Insufficient funds for this transaction') {
    super(message, 422, 'INSUFFICIENT_FUNDS');
  }
}

export class WalletInactiveError extends AppError {
  constructor(message = 'Wallet is not active or is frozen') {
    super(message, 400, 'WALLET_INACTIVE');
  }
}

export class DuplicateTransactionError extends AppError {
  constructor(message = 'A transaction with this idempotency key is already being processed or completed') {
    super(message, 409, 'DUPLICATE_TRANSACTION');
  }
}
