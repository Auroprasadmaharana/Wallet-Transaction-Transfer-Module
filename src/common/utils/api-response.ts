import { Response } from 'express';

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ApiResponsePayload<T> {
  success: boolean;
  message: string;
  data?: T;
  meta?: PaginationMeta | Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class ApiResponse {
  static success<T>(
    res: Response,
    data?: T,
    message = 'Request successful',
    statusCode = 200,
    meta?: PaginationMeta | Record<string, unknown>
  ): Response {
    const payload: ApiResponsePayload<T> = {
      success: true,
      message,
      ...(data !== undefined && { data }),
      ...(meta !== undefined && { meta }),
    };
    return res.status(statusCode).json(payload);
  }

  static created<T>(
    res: Response,
    data: T,
    message = 'Resource created successfully',
    meta?: Record<string, unknown>
  ): Response {
    return this.success(res, data, message, 201, meta);
  }

  static error(
    res: Response,
    message = 'An error occurred',
    statusCode = 500,
    errorCode = 'INTERNAL_ERROR',
    details?: unknown
  ): Response {
    const payload: ApiResponsePayload<null> = {
      success: false,
      message,
      error: {
        code: errorCode,
        message,
        ...(details ? { details } : {}),
      },
    };
    return res.status(statusCode).json(payload);
  }
}
