import fs from 'fs/promises';
import path from 'path';
import type { WorkspaceInfo } from '../protocol/messages.js';
import { CustomCwdStore } from './CustomCwdStore.js';

function normalizeWorkspacePath(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  const resolved = path.resolve(trimmed);
  if (resolved === path.parse(resolved).root) {
    return resolved;
  }

  return resolved.replace(/[\\/]+$/, '');
}

function getWorkspaceName(workspacePath: string): string {
  if (workspacePath === path.parse(workspacePath).root) {
    return workspacePath;
  }

  return path.basename(workspacePath) || workspacePath;
}

function isInsideAllowedPath(candidate: string, allowedPath: string): boolean {
  if (allowedPath === path.parse(allowedPath).root) {
    return path.isAbsolute(candidate);
  }

  return candidate === allowedPath || candidate.startsWith(`${allowedPath}${path.sep}`);
}

export class WorkspaceRegistry {
  private readonly configuredCwds: string[];
  private readonly configuredSet: Set<string>;

  constructor(configuredCwds: string[], private readonly customCwdStore: CustomCwdStore) {
    this.configuredCwds = configuredCwds
      .map((cwd) => normalizeWorkspacePath(cwd))
      .filter(Boolean);
    this.configuredSet = new Set(this.configuredCwds);
  }

  async getAllowedCwds(): Promise<string[]> {
    const combined = new Map<string, string>();

    for (const cwd of this.configuredCwds) {
      combined.set(cwd, cwd);
    }

    for (const cwd of await this.customCwdStore.list()) {
      const normalized = normalizeWorkspacePath(cwd);
      if (normalized) {
        combined.set(normalized, normalized);
      }
    }

    return Array.from(combined.values());
  }

  async getAllowedWorkspaces(): Promise<WorkspaceInfo[]> {
    const workspaces = new Map<string, WorkspaceInfo>();

    for (const cwd of await this.getAllowedCwds()) {
      workspaces.set(cwd, {
        name: getWorkspaceName(cwd),
        path: cwd,
      });
    }

    return Array.from(workspaces.values()).sort((left, right) => left.path.localeCompare(right.path));
  }

  async validateCwd(cwd: string): Promise<void> {
    if (!path.isAbsolute(cwd.trim())) {
      throw new Error(`cwd "${cwd}" must be an absolute path.`);
    }

    const normalized = normalizeWorkspacePath(cwd);
    const allowedPaths = await this.getAllowedCwds();
    const allowed = allowedPaths.some((allowedPath) => isInsideAllowedPath(normalized, allowedPath));

    if (!allowed) {
      throw new Error(
        `cwd "${cwd}" is not allowed. Add it as a custom workspace or include it in ALLOWED_CWDS.`,
      );
    }
  }

  async addCustomCwd(cwd: string): Promise<void> {
    const trimmed = cwd.trim();
    if (!trimmed) {
      throw new Error('Custom workspace path cannot be empty.');
    }

    if (!path.isAbsolute(trimmed)) {
      throw new Error(`cwd "${cwd}" must be an absolute path.`);
    }

    const normalized = normalizeWorkspacePath(trimmed);

    const stats = await fs.stat(normalized).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        throw new Error(`cwd "${cwd}" does not exist on the server.`);
      }

      throw error;
    });

    if (!stats.isDirectory()) {
      throw new Error(`cwd "${cwd}" must point to a directory.`);
    }

    if (this.configuredSet.has(normalized)) {
      return;
    }

    await this.customCwdStore.add(normalized);
  }

  async close(): Promise<void> {
    await this.customCwdStore.close();
  }
}