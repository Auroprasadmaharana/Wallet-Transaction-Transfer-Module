import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getCacheStore } from '../config/redis';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { ConflictError } from '../common/errors/app-error';

const IDEMPOTENCY_TTL_SECONDS = 86400; // 24 hours

export const idempotency = (req: Request, res: Response, next: NextFunction): void => {
  const keyHeader = req.headers['idempotency-key'] || req.headers['x-idempotency-key'];

  if (!keyHeader || typeof keyHeader !== 'string') {
    // Idempotency key is optional; if not supplied, continue normally
    return next();
  }

  const idempotencyKey = keyHeader.trim();
  req.idempotencyKey = idempotencyKey;

  const requestHash = crypto
    .createHash('sha256')
    .update(JSON.stringify({ path: req.originalUrl, body: req.body, user: req.user?.id }))
    .digest('hex');

  (async () => {
    const cache = getCacheStore();
    const cacheKey = `idempotency:${idempotencyKey}`;

    try {
      // 1. Check in-memory/Redis cache
      const cached = await cache.get(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed.status === 'PROCESSING') {
          return next(
            new ConflictError(
              'A transaction with this Idempotency-Key is currently being processed. Please retry shortly.'
            )
          );
        }

        logger.info(` [Idempotency] Returning cached response for key: ${idempotencyKey}`);
        res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT');
        return res.status(parsed.statusCode).json(parsed.body);
      }

      // 2. Check Database record for durability
      const dbRecord = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (dbRecord) {
        if (dbRecord.expiresAt > new Date()) {
          const parsedBody = JSON.parse(dbRecord.responseBody);
          res.setHeader('X-Cache-Lookup', 'HIT-IDEMPOTENT-DB');
          return res.status(dbRecord.statusCode).json(parsedBody);
        }
      }

      // 3. Mark key as PROCESSING with a 30s lock
      const acquired = await cache.setnx(cacheKey, JSON.stringify({ status: 'PROCESSING' }), 30);
      if (!acquired) {
        return next(
          new ConflictError(
            'Concurrent request detected with the same Idempotency-Key. Transaction is in flight.'
          )
        );
      }

      // 4. Intercept response to store result upon completion
      const originalSend = res.send;
      res.send = function (body: unknown): Response {
        res.send = originalSend;

        // Process storage asynchronously
        (async () => {
          try {
            let responseData: unknown;
            try {
              responseData = typeof body === 'string' ? JSON.parse(body) : body;
            } catch {
              responseData = body;
            }

            const payloadToStore = {
              status: 'COMPLETED',
              statusCode: res.statusCode,
              body: responseData,
            };

            // Save to Cache
            await cache.set(cacheKey, JSON.stringify(payloadToStore), IDEMPOTENCY_TTL_SECONDS);

            // Save to Database
            if (res.statusCode < 500) {
              await prisma.idempotencyRecord.upsert({
                where: { key: idempotencyKey },
                update: {
                  statusCode: res.statusCode,
                  responseBody: JSON.stringify(responseData),
                  expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000),
                },
                create: {
                  key: idempotencyKey,
                  userId: req.user?.id || null,
                  requestPath: req.originalUrl,
                  requestHash,
                  statusCode: res.statusCode,
                  responseBody: JSON.stringify(responseData),
                  expiresAt: new Date(Date.now() + IDEMPOTENCY_TTL_SECONDS * 1000),
                },
              });
            }
          } catch (err) {
            logger.error('Failed to persist idempotency record:', err);
          }
        })();

        return originalSend.call(this, body);
      };

      next();
    } catch (err) {
      logger.error('Idempotency middleware error:', err);
      next();
    }
  })();
};
