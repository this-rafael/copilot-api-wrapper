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
    'COPILOT_GITHUB_TOKEN',
    'GH_TOKEN',
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
