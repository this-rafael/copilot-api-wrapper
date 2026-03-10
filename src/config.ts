import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(0).default(3000),
  WS_AUTH_TOKEN: z.string().min(1, 'WS_AUTH_TOKEN is required'),
  ALLOWED_CWDS: z
    .string()
    .min(1, 'ALLOWED_CWDS must contain at least one path')
    .transform((val) => val.split(',').map((p) => p.trim()).filter(Boolean)),
  CUSTOM_CWDS_DB_PATH: z.string().trim().min(1).default('artifacts/custom-cwds.sqlite'),
  SESSION_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
  MAX_SESSIONS: z.coerce.number().int().positive().default(10),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
