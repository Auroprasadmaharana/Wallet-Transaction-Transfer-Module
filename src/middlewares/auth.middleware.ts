import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.config';
import { UnauthorizedError } from '../common/errors/app-error';
import { AuthUser } from '../common/types/express';

export const authenticateJwt = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new UnauthorizedError('Authentication token missing or invalid format');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    req.user = {
      id: decoded.id,
      email: decoded.email,
      name: decoded.name,
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new UnauthorizedError('Token has expired');
    }
    throw new UnauthorizedError('Invalid authentication token');
  }
};

export const optionalJwt = (req: Request, _res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
      };
    } catch {
      // Ignore token errors in optional auth
    }
  }
  next();
};
