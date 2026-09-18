import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded', 'down']),
  service: z.literal('dashgobo-api'),
  version: z.string(),
  timestamp: z.string().datetime(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.object({
    database: z.enum(['ok', 'down', 'skipped']),
  }),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;
