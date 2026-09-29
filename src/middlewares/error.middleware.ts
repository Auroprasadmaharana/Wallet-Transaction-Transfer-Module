import { Request, Response, NextFunction } from 'express';
import { AppError } from '../common/errors/app-error';
import { ApiResponse } from '../common/utils/api-response';
import { logger } from '../config/logger';
import { env } from '../config/env.config';
import { Prisma } from '@prisma/client';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): Response => {
  // Handle Domain / Operational Errors
  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error(`[Operational Error 500] ${err.message}`, { stack: err.stack, details: err.details });
    }
    return ApiResponse.error(res, err.message, err.statusCode, err.errorCode, err.details);
  }

  // Handle Prisma Known Request Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      const target = Array.isArray(err.meta?.target) ? err.meta.target.join(', ') : 'field';
      return ApiResponse.error(
        res,
        `Unique constraint violation on ${target}. A record with this value already exists.`,
        409,
        'DUPLICATE_RESOURCE',
        { target }
      );
    }
    if (err.code === 'P2025') {
      return ApiResponse.error(
        res,
        'An operation failed because required record was not found.',
        404,
        'RECORD_NOT_FOUND'
      );
    }
  }

  // Handle Generic / Unhandled Exceptions
  logger.error(`[Unhandled Exception] ${err.message}`, { stack: err.stack });

  const message = env.NODE_ENV === 'production' ? 'Internal server error' : err.message;
  return ApiResponse.error(
    res,
    message,
    500,
    'INTERNAL_SERVER_ERROR',
    env.NODE_ENV === 'development' ? { stack: err.stack } : undefined
  );
};

export const notFoundHandler = (req: Request, res: Response): Response => {
  return ApiResponse.error(
    res,
    `Cannot ${req.method} ${req.originalUrl} - Endpoint not found`,
    404,
    'ENDPOINT_NOT_FOUND'
  );
};
