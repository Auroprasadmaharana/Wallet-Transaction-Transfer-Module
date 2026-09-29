import Redis from 'ioredis';
import { env } from './env.config';
import { logger } from './logger';

export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  setnx(key: string, value: string, ttlSeconds: number): Promise<boolean>;
}

class MemoryStore implements CacheStore {
  private store: Map<string, { value: string; expiry: number | null }> = new Map();

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (item.expiry && item.expiry < Date.now()) {
      this.store.delete(key);
      return null;
    }
    return item.value;
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    const expiry = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expiry });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async setnx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) {
      return false;
    }
    await this.set(key, value, ttlSeconds);
    return true;
  }
}

class RedisCacheStore implements CacheStore {
  private client: Redis;

  constructor(redisUrl: string) {
    this.client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => {
        if (times > 2) return null;
        return Math.min(times * 100, 1000);
      },
      lazyConnect: true,
    });
  }

  async connect(): Promise<boolean> {
    try {
      await this.client.connect();
      logger.info('Connected to Redis');
      return true;
    } catch (error) {
      logger.warn('Redis unavailable, using in-memory store.');
      return false;
    }
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async setnx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }
}

let activeStore: CacheStore = new MemoryStore();

export const initCacheStore = async (): Promise<CacheStore> => {
  if (env.REDIS_ENABLED) {
    const redisStore = new RedisCacheStore(env.REDIS_URL);
    const connected = await redisStore.connect();
    if (connected) {
      activeStore = redisStore;
      return activeStore;
    }
  }
  activeStore = new MemoryStore();
  return activeStore;
};

export const getCacheStore = (): CacheStore => activeStore;
