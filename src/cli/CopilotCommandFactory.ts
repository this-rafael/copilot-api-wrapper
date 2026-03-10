import { execFileSync } from 'child_process';

export type CommandProfile = 'copilot-interactive' | 'gh-copilot-suggest';

export interface CliCommand {
  command: string;
  args: string[];
}

// Flags that must never be included regardless of profile or configuration
const FORBIDDEN_FLAGS = new Set([
  '--allow-all',
  '--autopilot',
  '--allow-all-tools',
  '--allow-all-paths',
]);

const PROFILE_ARGS: Record<CommandProfile, string[]> = {
  'copilot-interactive': ['--log-level', 'error', '--no-auto-update', '--yolo'],
  'gh-copilot-suggest': ['suggest', '--log-level', 'error'],
};

export class CopilotCommandFactory {
  static build(profile: CommandProfile): CliCommand {
    const command = CopilotCommandFactory.resolveExecutable(profile);
    const args = PROFILE_ARGS[profile];

    // Safety assertion: ensure no forbidden flag leaked into args
    for (const arg of args) {
      if (FORBIDDEN_FLAGS.has(arg)) {
        throw new Error(`Forbidden flag detected in profile args: ${arg}`);
      }
    }

    if (profile === 'copilot-interactive' && !args.includes('--yolo')) {
      throw new Error('Interactive profile must always include --yolo');
    }

    return { command, args };
  }

  private static resolveExecutable(profile: CommandProfile): string {
    if (profile === 'gh-copilot-suggest') {
      const ghPath = CopilotCommandFactory.findInPath('gh');
      if (ghPath) return ghPath;
      throw new Error('gh CLI not found in PATH. Install gh and gh copilot extension.');
    }

    // copilot-interactive: try standalone `copilot` first, fall back to `gh copilot`
    const copilotPath = CopilotCommandFactory.findInPath('copilot');
    if (copilotPath) return copilotPath;

    const ghPath = CopilotCommandFactory.findInPath('gh');
    if (ghPath) return ghPath;

    throw new Error('Neither `copilot` nor `gh` CLI found in PATH.');
  }

  static findInPath(bin: string): string | null {
    try {
      const result = execFileSync('which', [bin], { encoding: 'utf8' }).trim();
      return result.length > 0 ? result : null;
    } catch {
      return null;
    }
  }
}
