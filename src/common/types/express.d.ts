/* eslint-disable @typescript-eslint/no-unused-vars */
import { Express } from 'express';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      idempotencyKey?: string;
      startTime?: number;
    }
  }
}
