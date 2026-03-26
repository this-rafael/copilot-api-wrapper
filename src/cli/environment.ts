import { execSync } from 'child_process';

/**
 * Builds an explicit allowlist environment for the child Copilot process.
 * Never passes the full server environment to avoid leaking unrelated secrets.
 */
export function buildChildEnv(): Record<string, string> {
  const allowed: Array<keyof NodeJS.ProcessEnv> = [
    'HOME',
    'PATH',
    'TERM',
    'LANG',
    'LC_ALL',
    'LC_CTYPE',
    'USER',
    'LOGNAME',
    'SHELL',
    'COPILOT_TOKEN',
    'GH_TOKEN',
    'GITHUB_COPILOT_TOKEN',
    'GH_COPILOT_TOKEN',
    'GITHUB_USER',
    'GH_USER',
    'GITHUB_LOGIN',
    'XDG_CONFIG_HOME',
    'APPDATA',
    'LOCALAPPDATA',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'SSL_CERT_FILE',
    'SSL_CERT_DIR',
  ];

  const env: Record<string, string> = {};
  for (const key of allowed) {
    const value = process.env[key as string];
    if (value !== undefined) {
      env[key as string] = value;
    }
  }

  // Always set a sane TERM so the CLI behaves as in a real terminal
  if (!env['TERM']) {
    env['TERM'] = 'xterm-256color';
  }

  return env;
}

/**
 * Tries to obtain a GitHub PAT from the `gh` CLI (i.e. `gh auth login` was run).
 * Returns undefined if the CLI is unavailable or the user is not authenticated.
 */
function resolveGhCliToken(): string | undefined {
  try {
    const token = execSync('gh auth token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return token || undefined;
  } catch {
    return undefined;
  }
}

export function resolveGitHubToken(env: Record<string, string | undefined>): string | undefined {
  return env.COPILOT_TOKEN
    ?? env.GH_TOKEN
    ?? env.GITHUB_COPILOT_TOKEN
    ?? env.GH_COPILOT_TOKEN
    ?? resolveGhCliToken();
}

export function resolveGitHubUserHint(env: Record<string, string | undefined>): string | undefined {
  return env.GITHUB_USER
    ?? env.GH_USER
    ?? env.GITHUB_LOGIN;
}
