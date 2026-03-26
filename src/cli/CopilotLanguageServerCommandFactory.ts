import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import type { CliCommand } from './CopilotCommandFactory.js';

const require = createRequire(import.meta.url);

export class CopilotLanguageServerCommandFactory {
  static build(customServerPath?: string): CliCommand {
    if (customServerPath) {
      return CopilotLanguageServerCommandFactory.buildFromCustomPath(customServerPath);
    }

    const packageJsonPath = require.resolve('@github/copilot-language-server/package.json');
    const packageDirectory = path.dirname(packageJsonPath);
    const entrypoint = path.resolve(packageDirectory, 'dist/language-server.js');

    if (!fs.existsSync(entrypoint)) {
      throw new Error(`copilot-language-server entrypoint not found at ${entrypoint}`);
    }

    return {
      command: process.execPath,
      args: [entrypoint, '--stdio'],
    };
  }

  private static buildFromCustomPath(customServerPath: string): CliCommand {
    const normalizedPath = customServerPath.trim();
    if (!normalizedPath) {
      throw new Error('COPILOT_LSP_PATH cannot be empty');
    }

    if (/\.(?:cjs|mjs|js)$/i.test(normalizedPath)) {
      return {
        command: process.execPath,
        args: [normalizedPath, '--stdio'],
      };
    }

    return {
      command: normalizedPath,
      args: ['--stdio'],
    };
  }
}
