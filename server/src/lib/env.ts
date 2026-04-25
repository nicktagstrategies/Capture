import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url().optional(),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 30),

  STRIPE_SECRET_KEY: z.string().startsWith('sk_'),
  STRIPE_PUBLISHABLE_KEY: z.string().startsWith('pk_'),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_'),

  APPLE_CLIENT_ID: z.string().optional(),
  GOOGLE_IOS_CLIENT_ID: z.string().optional(),

  FLAT_CUSTOMER_FEE_CENTS: z.coerce.number().int().nonnegative().default(150),
  COMMISSION_RATE: z.coerce.number().min(0).max(1).default(0.1),

  HOURS_FOR_FULL_REFUND: z.coerce.number().nonnegative().default(48),
  HOURS_FOR_PARTIAL_REFUND: z.coerce.number().nonnegative().default(24),
  PARTIAL_REFUND_RATE: z.coerce.number().min(0).max(1).default(0.5),

  S3_REGION: z.string().default('us-west-2'),
  S3_BUCKET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),

  SUPPORT_INBOX_EMAIL: z.string().email().default('support@capture.app'),
});

function loadEnv() {
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
export type Env = typeof env;
