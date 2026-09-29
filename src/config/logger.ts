import winston from 'winston';
import { env } from './env.config';

const { combine, timestamp, printf, colorize, json, errors } = winston.format;

const customFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  const stackString = stack ? `\n${stack}` : '';
  return `[${timestamp}] [${level}]: ${message}${metaString}${stackString}`;
});

export const logger = winston.createLogger({
  level: env.LOG_LEVEL,
  format: combine(
    timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    errors({ stack: true }),
    env.NODE_ENV === 'production' ? json() : combine(colorize(), customFormat)
  ),
  transports: [
    new winston.transports.Console({
      silent: env.NODE_ENV === 'test',
    }),
  ],
});
