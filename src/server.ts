import { createApp } from './app';
import { env } from './config/env.config';
import { logger } from './config/logger';
import { connectDatabase, disconnectDatabase } from './config/database';
import { initCacheStore } from './config/redis';

const bootstrap = async () => {
  try {
    await connectDatabase();
    await initCacheStore();

    const app = createApp();

    const server = app.listen(env.PORT, () => {
      logger.info(`Server running on http://localhost:${env.PORT}`);
      logger.info(`Swagger Documentation: http://localhost:${env.PORT}/api-docs`);
    });

    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) => {
      process.on(signal, async () => {
        logger.info(`Received ${signal}, initiating graceful shutdown...`);
        server.close(async () => {
          logger.info('HTTP server closed.');
          await disconnectDatabase();
          logger.info('Shutdown complete. Exiting process.');
          process.exit(0);
        });
      });
    });
  } catch (error) {
    logger.error('Fatal error during server startup:', error);
    process.exit(1);
  }
};

bootstrap();
