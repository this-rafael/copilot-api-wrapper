import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';

type TimeoutHandle = ReturnType<typeof setTimeout>;

interface TreeNode {
  readonly name: string;
  readonly children: Map<string, TreeNode>;
  isDirectory: boolean;
  truncated: boolean;
}

interface CacheEntry {
  value: string;
  expiresAt: number;
  refreshPromise?: Promise<void>;
  timer?: TimeoutHandle;
}

export interface WorkspaceTreeBuilderOptions {
  ttlMs?: number;
  maxDepth?: number;
  maxPaths?: number;
  now?: () => number;
  listFiles?: (cwd: string) => Promise<string[]>;
  scheduleRefresh?: (callback: () => void, delayMs: number) => TimeoutHandle;
  clearScheduledRefresh?: (handle: TimeoutHandle) => void;
}

const DEFAULT_TTL_MS = 60_000;
const DEFAULT_MAX_DEPTH = 4;
const DEFAULT_MAX_PATHS = 200;
const EXCLUDED_SEGMENTS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next']);
const EXCLUDED_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.pdf',
  '.zip',
  '.tar',
  '.gz',
  '.mp4',
  '.mp3',
  '.woff',
  '.woff2',
]);

function createNode(name: string, isDirectory = true): TreeNode {
  return {
    name,
    children: new Map<string, TreeNode>(),
    isDirectory,
    truncated: false,
  };
}

export class WorkspaceTreeBuilder {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly ttlMs: number;
  private readonly maxDepth: number;
  private readonly maxPaths: number;
  private readonly now: () => number;
  private readonly listFiles: (cwd: string) => Promise<string[]>;
  private readonly scheduleRefresh: (callback: () => void, delayMs: number) => TimeoutHandle;
  private readonly clearScheduledRefresh: (handle: TimeoutHandle) => void;

  constructor(options: WorkspaceTreeBuilderOptions = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxPaths = options.maxPaths ?? DEFAULT_MAX_PATHS;
    this.now = options.now ?? Date.now;
    this.listFiles = options.listFiles ?? ((cwd) => this.listWorkspaceFiles(cwd));
    this.scheduleRefresh = options.scheduleRefresh ?? ((callback, delayMs) => {
      const handle = setTimeout(callback, delayMs);
      handle.unref?.();
      return handle;
    });
    this.clearScheduledRefresh = options.clearScheduledRefresh ?? clearTimeout;
  }

  async getTree(cwd: string): Promise<string> {
    const now = this.now();
    const cached = this.entries.get(cwd);

    if (cached && now < cached.expiresAt) {
      return cached.value;
    }

    if (cached) {
      this.ensureBackgroundRefresh(cwd, cached);
      return cached.value;
    }

    await this.refresh(cwd);
    return this.entries.get(cwd)?.value ?? '';
  }

  close(): void {
    for (const entry of this.entries.values()) {
      if (entry.timer) {
        this.clearScheduledRefresh(entry.timer);
      }
    }

    this.entries.clear();
  }

  private ensureBackgroundRefresh(cwd: string, entry: CacheEntry): void {
    if (entry.refreshPromise) {
      return;
    }

    entry.refreshPromise = this.refresh(cwd)
      .catch(() => {
        this.scheduleEntryRefresh(cwd, entry);
      })
      .finally(() => {
        const latest = this.entries.get(cwd);
        if (latest) {
          latest.refreshPromise = undefined;
        }
      });
  }

  private async refresh(cwd: string): Promise<void> {
    const filePaths = await this.listFiles(cwd);
    const value = this.buildTree(filePaths);
    const entry = this.entries.get(cwd) ?? {
      value,
      expiresAt: 0,
    };

    if (entry.timer) {
      this.clearScheduledRefresh(entry.timer);
    }

    entry.value = value;
    entry.expiresAt = this.now() + this.ttlMs;
    this.entries.set(cwd, entry);
    this.scheduleEntryRefresh(cwd, entry);
  }

  private scheduleEntryRefresh(cwd: string, entry: CacheEntry): void {
    if (entry.timer) {
      this.clearScheduledRefresh(entry.timer);
    }

    entry.timer = this.scheduleRefresh(() => {
      const latest = this.entries.get(cwd);
      if (!latest) {
        return;
      }

      latest.timer = undefined;
      this.ensureBackgroundRefresh(cwd, latest);
    }, this.ttlMs);
  }

  private buildTree(filePaths: string[]): string {
    const includedPaths = filePaths
      .filter((filePath) => this.shouldIncludePath(filePath))
      .sort((left, right) => left.localeCompare(right));
    const visiblePaths = includedPaths.slice(0, this.maxPaths);
    const omittedCount = Math.max(0, includedPaths.length - visiblePaths.length);

    if (visiblePaths.length === 0) {
      return '(workspace tree unavailable)';
    }

    const root = createNode('.');
    for (const filePath of visiblePaths) {
      this.insertPath(root, filePath.split('/').filter(Boolean));
    }

    const lines: string[] = [];
    this.renderNodeChildren(root, '', lines);
    if (omittedCount > 0) {
      lines.push(`... ${omittedCount} more paths omitted`);
    }

    return lines.join('\n');
  }

  private insertPath(root: TreeNode, segments: string[]): void {
    let node = root;

    for (let index = 0; index < segments.length; index += 1) {
      if (index >= this.maxDepth) {
        node.truncated = true;
        return;
      }

      const segment = segments[index];
      const isDirectory = index < segments.length - 1;
      const existing = node.children.get(segment);
      if (existing) {
        existing.isDirectory = existing.isDirectory || isDirectory;
        node = existing;
        continue;
      }

      const child = createNode(segment, isDirectory);
      node.children.set(segment, child);
      node = child;
    }
  }

  private renderNodeChildren(node: TreeNode, indent: string, lines: string[]): void {
    const children = Array.from(node.children.values()).sort((left, right) => {
      if (left.isDirectory !== right.isDirectory) {
        return left.isDirectory ? -1 : 1;
      }

      return left.name.localeCompare(right.name);
    });

    for (const child of children) {
      lines.push(`${indent}${child.name}${child.isDirectory ? '/' : ''}`);
      if (child.isDirectory) {
        this.renderNodeChildren(child, `${indent}  `, lines);
        if (child.truncated) {
          lines.push(`${indent}  ...`);
        }
      }
    }
  }

  private shouldIncludePath(filePath: string): boolean {
    const segments = filePath.split('/').filter(Boolean);
    if (segments.some((segment) => EXCLUDED_SEGMENTS.has(segment))) {
      return false;
    }

    const extension = path.extname(filePath).toLowerCase();
    if (extension && EXCLUDED_EXTENSIONS.has(extension)) {
      return false;
    }

    return true;
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

        resolve(stdout
          .split(/\r?\n/u)
          .map((line) => line.trim())
          .filter(Boolean));
      });
    });
  }

  private async listWorkspaceFilesWithFs(cwd: string): Promise<string[]> {
    const entries: string[] = [];

    async function walk(currentDir: string, relativePrefix = ''): Promise<void> {
      const children = await fs.readdir(currentDir, { withFileTypes: true });
      for (const child of children) {
        if (child.name === '.git') {
          continue;
        }

        const absolutePath = path.join(currentDir, child.name);
        const relativePath = relativePrefix ? path.posix.join(relativePrefix, child.name) : child.name;

        if (child.isDirectory()) {
          await walk(absolutePath, relativePath);
        } else if (child.isFile()) {
          entries.push(relativePath);
        }
      }
    }

    await walk(cwd);
    return entries;
  }
}
