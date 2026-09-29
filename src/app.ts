import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import swaggerUi from 'swagger-ui-express';

import { httpLogger } from './middlewares/logger.middleware';
import { errorHandler, notFoundHandler } from './middlewares/error.middleware';
import { authRoutes } from './modules/auth/auth.routes';
import { walletRoutes } from './modules/wallet/wallet.routes';
import { transactionRoutes } from './modules/transaction/transaction.routes';
import { swaggerDocument } from './docs/swagger';
import { ApiResponse } from './common/utils/api-response';

export const createApp = (): Application => {
  const app = express();

  // Security & Core Middlewares
  app.use(
    helmet({
      contentSecurityPolicy: false, // Enable inline assets for Swagger UI and local test UI
      crossOriginEmbedderPolicy: false,
    })
  );
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(httpLogger);

  // Serve static UI for visual testing
  app.use(express.static(path.join(__dirname, '../public')));

  // Swagger Documentation
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
  app.get('/api-docs.json', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerDocument);
  });

  // Health check endpoint
  app.get('/health', (_req: Request, res: Response) => {
    ApiResponse.success(
      res,
      {
        status: 'UP',
        service: 'Wallet Transaction & Transfer Module',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
      },
      'Service is healthy'
    );
  });

  // API V1 Routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/wallets', walletRoutes);
  app.use('/api/v1/transactions', transactionRoutes);

  // 404 and Error Middlewares
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
