import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(3741),
  MCP_AUTH_TOKEN: z.string().min(1, 'MCP_AUTH_TOKEN is required'),
  ALLOWED_IPS: z
    .string()
    .default('')
    .transform((v) => v.split(',').map((s) => s.trim()).filter(Boolean)),
  STATE_PATH: z.string().default('state/open-rules.json'),
  MAX_TTL_SECONDS: z.coerce.number().int().positive().default(3600),
  MIN_TTL_SECONDS: z.coerce.number().int().positive().default(60),
  CLEANUP_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
});

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
