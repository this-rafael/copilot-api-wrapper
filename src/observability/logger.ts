import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: [
      'token',
      'authorization',
      'headers.authorization',
      'env.COPILOT_GITHUB_TOKEN',
      'COPILOT_GITHUB_TOKEN',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'copilot-api-wrapper',
  },
});
