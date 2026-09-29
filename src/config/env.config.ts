import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  PORT: z.string().default('3000').transform((val) => parseInt(val, 10)),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string().default('file:./dev.db?connection_limit=1&timeout=20000'),
  JWT_SECRET: z.string().default('super_secret_jwt_key_wallet_production_2026_change_in_prod'),
  JWT_EXPIRES_IN: z.string().default('24h'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  REDIS_ENABLED: z
    .string()
    .default('false')
    .transform((val) => val === 'true'),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'http', 'debug']).default('info'),
});

const parseEnv = () => {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:', result.error.format());
    process.exit(1);
  }
  return result.data;
};

export const env = parseEnv();
export type Env = z.infer<typeof envSchema>;
