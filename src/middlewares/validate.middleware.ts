import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { UnprocessableEntityError } from '../common/errors/app-error';

interface ValidationSchema {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

export const validateRequest = (schema: ValidationSchema) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schema.body) {
        req.body = await schema.body.parseAsync(req.body);
      }
      if (schema.query) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).query = await schema.query.parseAsync(req.query);
      }
      if (schema.params) {
        req.params = (await schema.params.parseAsync(req.params)) as Record<string, string>;
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const formattedErrors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));
        next(new UnprocessableEntityError('Validation failed', formattedErrors));
      } else {
        next(error);
      }
    }
  };
};
