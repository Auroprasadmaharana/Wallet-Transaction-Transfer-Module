import morgan from 'morgan';
import { logger } from '../config/logger';

export const httpLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  {
    stream: {
      write: (message: string) => logger.http(message.trim()),
    },
    skip: () => process.env.NODE_ENV === 'test',
  }
);
