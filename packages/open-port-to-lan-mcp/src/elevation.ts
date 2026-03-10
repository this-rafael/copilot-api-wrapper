import { execSync } from 'child_process';

/**
 * Returns true if the current process is running with Administrator privileges on Windows.
 * On non-Windows platforms always returns false (triggers dry-run mode in other modules).
 */
export function isElevated(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execSync('net session', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws if the process is not elevated (Admin) on Windows.
 * On non-Windows, emits a warning; the server still starts in dry-run mode.
 */
export function assertElevated(): void {
  if (process.platform !== 'win32') {
    console.warn(
      '[elevation] Warning: not running on Windows. ' +
        'Firewall commands will be logged but not executed (dry-run mode).',
    );
    return;
  }
  if (!isElevated()) {
    throw new Error(
      'This server must be started as Administrator.\n' +
        'Right-click the EXE and choose "Run as administrator",\n' +
        'or open an elevated Command Prompt / PowerShell and run the server from there.\n\n' +
        'Note: only the server startup requires Administrator privileges.\n' +
        'MCP clients can call the tools from any process without elevated access.',
    );
  }
}
