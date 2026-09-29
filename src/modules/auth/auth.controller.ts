import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service';
import { ApiResponse } from '../../common/utils/api-response';
import { UnauthorizedError } from '../../common/errors/app-error';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.register(req.body);
      ApiResponse.created(res, result, 'User registered successfully');
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await authService.login(req.body);
      ApiResponse.success(res, result, 'User logged in successfully');
    } catch (error) {
      next(error);
    }
  }

  async getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.user?.id) {
        throw new UnauthorizedError('User authentication required');
      }
      const user = await authService.getProfile(req.user.id);
      ApiResponse.success(res, user, 'User profile fetched successfully');
    } catch (error) {
      next(error);
    }
  }
}

export const authController = new AuthController();
