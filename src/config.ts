import { z } from 'zod';

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}, z.string().min(1).optional());

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on') {
    return true;
  }

  if (normalized === 'false' || normalized === '0' || normalized === 'no' || normalized === 'off') {
    return false;
  }

  return value;
}, z.boolean());

const configSchema = z
  .object({
    PORT: z.coerce.number().int().min(0).default(3000),
    AUTH_DISABLED: booleanFromEnv.default(false),
    WS_AUTH_TOKEN: optionalTrimmedString,
    ALLOWED_CWDS: z
      .string()
      .min(1, 'ALLOWED_CWDS must contain at least one path')
      .transform((val) => val.split(',').map((p) => p.trim()).filter(Boolean)),
    CUSTOM_CWDS_DB_PATH: z.string().trim().min(1).default('artifacts/custom-cwds.sqlite'),
    SESSION_TIMEOUT_MS: z.coerce.number().int().positive().default(1_800_000),
    MAX_SESSIONS: z.coerce.number().int().positive().default(10),
    COPILOT_LSP_PATH: optionalTrimmedString,
    AUTOCOMPLETE_MODEL: z.string().trim().min(1).default('raptor-mini'),
    AUTOCOMPLETE_CONTEXT_ENABLED: booleanFromEnv.default(true),
    LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  })
  .superRefine((data, ctx) => {
    if (!data.AUTH_DISABLED && !data.WS_AUTH_TOKEN) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'WS_AUTH_TOKEN is required when AUTH_DISABLED is not set',
        path: ['WS_AUTH_TOKEN'],
      });
    }
  });

const parsed = configSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment configuration:');
  console.error(parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
