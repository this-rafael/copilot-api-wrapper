import type { IncomingMessage } from 'http';

/**
 * Extracts the Bearer token from the Authorization header.
 * Returns null if not present or malformed.
 */
export function extractBearerToken(req: IncomingMessage): string | null {
  const auth = req.headers['authorization'];
  if (typeof auth !== 'string') return null;
  const match = auth.match(/^Bearer\s+(.+)$/i);
  return match ? (match[1] ?? null) : null;
}

export function extractQueryToken(req: IncomingMessage): string | null {
  if (!req.url) return null;

  try {
    const origin = `http://${req.headers.host ?? 'localhost'}`;
    const url = new URL(req.url, origin);
    const token = url.searchParams.get('token');
    return token && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

export function extractRequestToken(req: IncomingMessage): string | null {
  return extractBearerToken(req) ?? extractQueryToken(req);
}

/**
 * Returns true if the provided token matches the expected secret.
 * Uses a constant-time comparison approach via string equality after
 * ensuring the same length (avoids early-exit timing leaks for secrets of same length).
 */
export function isValidToken(token: string, expected: string): boolean {
  if (token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return mismatch === 0;
}
