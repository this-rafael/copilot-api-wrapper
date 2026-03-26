import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import type { ContextSearchItem, MentionType } from '../protocol/messages.js';
import type { WorkspaceRegistry } from '../workspaces/WorkspaceRegistry.js';

const DEFAULT_LIMIT = 20;

export interface ContextSearchRequest {
  cwd: string;
  mentionType: MentionType;
  query: string;
  limit?: number;
}

export class ContextSearchService {
  constructor(private readonly workspaceRegistry: WorkspaceRegistry) {}

  async search(request: ContextSearchRequest): Promise<ContextSearchItem[]> {
    await this.workspaceRegistry.validateCwd(request.cwd);

    const limit = Math.max(1, Math.min(request.limit ?? DEFAULT_LIMIT, 50));
    const normalizedQuery = request.query.trim().toLowerCase();

    if (request.mentionType === 'workspace') {
      const label = path.basename(request.cwd) || request.cwd;
      return [
        {
          id: '.',
          kind: 'workspace',
          label,
          path: '.',
          description: request.cwd,
        },
      ];
    }

    const filePaths = await this.listWorkspaceFiles(request.cwd);
    if (request.mentionType === 'file') {
      return this.matchFiles(filePaths, normalizedQuery, limit);
    }

    return this.matchFolders(filePaths, normalizedQuery, limit);
  }

  private async listWorkspaceFiles(cwd: string): Promise<string[]> {
    try {
      return await this.listWorkspaceFilesWithRipgrep(cwd);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        throw error;
      }

      return this.listWorkspaceFilesWithFs(cwd);
    }
  }

  private async listWorkspaceFilesWithRipgrep(cwd: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const child = spawn('rg', ['--files', '--hidden', '--glob', '!.git'], {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (error) => {
        reject(error);
      });

      child.on('close', (code) => {
        if (code !== 0 && stdout.length === 0) {
          reject(new Error(stderr.trim() || `rg exited with code ${code}`));
          return;
        }

        const lines = stdout
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean);

        resolve(lines);
      });
    });
  }

  private async listWorkspaceFilesWithFs(cwd: string): Promise<string[]> {
    const entries: string[] = [];

    async function walk(currentDir: string, relativePrefix = ''): Promise<void> {
      const dirEntries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of dirEntries) {
        if (entry.name === '.git') {
          continue;
        }

        const absolutePath = path.join(currentDir, entry.name);
        const relativePath = relativePrefix ? path.posix.join(relativePrefix, entry.name) : entry.name;

        if (entry.isDirectory()) {
          await walk(absolutePath, relativePath);
          continue;
        }

        if (entry.isFile()) {
          entries.push(relativePath);
        }
      }
    }

    await walk(cwd);
    return entries;
  }

  private matchFiles(paths: string[], query: string, limit: number): ContextSearchItem[] {
    return paths
      .map((entry) => ({ entry, score: this.scorePath(entry, query) }))
      .filter((item): item is { entry: string; score: number } => item.score !== null)
      .sort((left, right) => left.score - right.score || left.entry.localeCompare(right.entry))
      .slice(0, limit)
      .map(({ entry }) => ({
        id: entry,
        kind: 'file' as const,
        label: path.basename(entry),
        path: entry,
        description: entry,
      }));
  }

  private matchFolders(paths: string[], query: string, limit: number): ContextSearchItem[] {
    const folders = new Set<string>();
    for (const entry of paths) {
      const dirname = path.dirname(entry);
      if (dirname !== '.') {
        let current = dirname;
        while (current !== '.' && current !== path.dirname(current)) {
          folders.add(current);
          current = path.dirname(current);
        }
      }
    }

    return [...folders]
      .map((entry) => ({ entry, score: this.scorePath(entry, query) }))
      .filter((item): item is { entry: string; score: number } => item.score !== null)
      .sort((left, right) => left.score - right.score || left.entry.localeCompare(right.entry))
      .slice(0, limit)
      .map(({ entry }) => ({
        id: entry,
        kind: 'folder' as const,
        label: path.basename(entry),
        path: entry,
        description: entry,
      }));
  }

  private scorePath(entry: string, query: string): number | null {
    if (!query) {
      return entry.split('/').length;
    }

    const normalized = entry.toLowerCase();
    const basename = path.basename(normalized);

    if (basename === query) {
      return 0;
    }

    if (normalized === query) {
      return 1;
    }

    if (basename.startsWith(query)) {
      return 5 + (basename.length - query.length);
    }

    if (normalized.startsWith(query)) {
      return 10 + (normalized.length - query.length);
    }

    const basenameIndex = basename.indexOf(query);
    if (basenameIndex >= 0) {
      return 20 + basenameIndex;
    }

    const index = normalized.indexOf(query);
    if (index >= 0) {
      return 40 + index;
    }

    const basenameFuzzyScore = this.scoreSubsequence(basename, query);
    if (basenameFuzzyScore !== null) {
      return 80 + basenameFuzzyScore;
    }

    const pathFuzzyScore = this.scoreSubsequence(normalized, query);
    if (pathFuzzyScore !== null) {
      return 120 + pathFuzzyScore;
    }

    return null;
  }

  private scoreSubsequence(value: string, query: string): number | null {
    let score = 0;
    let consecutiveBonus = 0;
    let previousIndex = -1;
    let firstIndex = -1;

    for (const character of query) {
      const nextIndex = value.indexOf(character, previousIndex + 1);
      if (nextIndex === -1) {
        return null;
      }

      if (firstIndex === -1) {
        firstIndex = nextIndex;
      }

      if (previousIndex >= 0) {
        score += nextIndex - previousIndex - 1;
        if (nextIndex === previousIndex + 1) {
          consecutiveBonus += 2;
        }
      } else {
        score += nextIndex;
      }

      previousIndex = nextIndex;
    }

    return Math.max(0, score + firstIndex - consecutiveBonus);
  }
}