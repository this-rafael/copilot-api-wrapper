import { config } from '../config.js';

function normalizeAllowedPath(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '/') {
    return trimmed;
  }

  return trimmed.replace(/\/+$/, '');
}

function getWorkspaceName(workspacePath: string): string {
  if (workspacePath === '/') {
    return workspacePath;
  }

  const segments = workspacePath.split('/').filter(Boolean);
  return segments.at(-1) ?? workspacePath;
}

export function getAllowedCwds(): string[] {
  const raw = process.env['ALLOWED_CWDS'];
  if (typeof raw === 'string' && raw.trim().length > 0) {
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  return config.ALLOWED_CWDS;
}

export function getAllowedWorkspaces(): Array<{ name: string; path: string }> {
  const workspaces = new Map<string, { name: string; path: string }>();

  for (const cwd of getAllowedCwds()) {
    const normalizedPath = normalizeAllowedPath(cwd);
    if (!normalizedPath) {
      continue;
    }

    workspaces.set(normalizedPath, {
      name: getWorkspaceName(normalizedPath),
      path: normalizedPath,
    });
  }

  return Array.from(workspaces.values());
}

/**
 * Validates that the given cwd is within one of the configured allowed paths.
 * Uses a prefix check with a path separator to prevent partial directory matches.
 * E.g., allowlist=/tmp/safe must NOT allow /tmp/safe-evil.
 */
export function validateCwd(cwd: string): void {
  const normalized = normalizeAllowedPath(cwd);
  const allowed = getAllowedCwds().some((allowedPath) => {
    const allowedNormalized = normalizeAllowedPath(allowedPath);

    if (allowedNormalized === '/') {
      return normalized.startsWith('/');
    }

    return normalized === allowedNormalized || normalized.startsWith(`${allowedNormalized}/`);
  });

  if (!allowed) {
    throw new Error(
      `cwd "${cwd}" is not in the allowed paths list. Configure ALLOWED_CWDS to include it.`,
    );
  }
}
