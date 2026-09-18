import { z } from 'zod';

/**
 * Environment contract for the API. Validated once at bootstrap; a failure here
 * aborts startup with a readable message instead of surfacing later as an
 * undefined value deep in a service.
 *
 * Dev-friendly defaults are provided so `pnpm dev` works with no `.env`, but
 * `assertProductionSecrets` refuses to start production with placeholder values.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(3001),
  APP_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),

  // Supabase (or any Postgres). DATABASE_URL is the pooled connection used at
  // runtime; DIRECT_URL is the unpooled one Prisma Migrate needs. If DIRECT_URL
  // is left empty it falls back to DATABASE_URL (fine for a direct, non-pooled
  // Postgres with no pgbouncer in front of it).
  DATABASE_URL: z
    .string()
    .url()
    .default('postgresql://dashgobo:dashgobo@localhost:5432/dashgobo?schema=public'),
  DIRECT_URL: z.string().url().or(z.literal('')).default(''),

  JWT_SECRET: z.string().min(1).default('dev-only-access-secret'),
  JWT_REFRESH_SECRET: z.string().min(1).default('dev-only-refresh-secret'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),

  ENCRYPTION_KEY: z.string().min(1).default('dev-only-encryption-key-change-me'),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).default('local'),
  EMAIL_PROVIDER: z.enum(['mock', 'mailpit', 'ses', 'resend']).default('mailpit'),
  INVOICE_PROVIDER: z.enum(['mock', 'arca']).default('mock'),
  ARCA_ENVIRONMENT: z.enum(['homologation', 'production']).default('homologation'),
});

export type Env = z.infer<typeof envSchema>;

const PLACEHOLDER_SECRETS = new Set([
  'dev-only-access-secret',
  'dev-only-refresh-secret',
  'dev-only-encryption-key-change-me',
  'change-me-access-secret',
  'change-me-refresh-secret',
  'change-me-32-byte-base64-key',
]);

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  const env = result.data;
  if (!env.DIRECT_URL) {
    env.DIRECT_URL = env.DATABASE_URL;
  }
  if (env.NODE_ENV === 'production') {
    assertProductionSecrets(env);
  }
  return env;
}

function assertProductionSecrets(env: Env): void {
  const offenders = (['JWT_SECRET', 'JWT_REFRESH_SECRET', 'ENCRYPTION_KEY'] as const).filter(
    (key) => PLACEHOLDER_SECRETS.has(env[key]),
  );
  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start in production with placeholder secrets: ${offenders.join(', ')}`,
    );
  }
}
