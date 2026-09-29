import { Router } from 'express';
import { authController } from './auth.controller';
import { validateRequest } from '../../middlewares/validate.middleware';
import { registerSchema, loginSchema } from './auth.dto';
import { authenticateJwt } from '../../middlewares/auth.middleware';

const router = Router();

router.post(
  '/register',
  validateRequest({ body: registerSchema }),
  (req, res, next) => authController.register(req, res, next)
);

router.post(
  '/login',
  validateRequest({ body: loginSchema }),
  (req, res, next) => authController.login(req, res, next)
);

router.get('/me', authenticateJwt, (req, res, next) =>
  authController.getMe(req, res, next)
);

export const authRoutes = router;
