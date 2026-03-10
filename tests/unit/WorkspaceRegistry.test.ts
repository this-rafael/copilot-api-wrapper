import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function createRegistry(configuredCwds: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-registry-'));
  tempDirs.push(root);

  const [{ WorkspaceRegistry }, { CustomCwdStore }] = await Promise.all([
    import('../../src/workspaces/WorkspaceRegistry.js'),
    import('../../src/workspaces/CustomCwdStore.js'),
  ]);

  return new WorkspaceRegistry(configuredCwds, new CustomCwdStore(path.join(root, 'custom-cwds.sqlite')));
}

describe('WorkspaceRegistry', () => {
  it('persists custom workspaces and merges them with configured ones', async () => {
    const configuredRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-configured-'));
    const customRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-custom-'));
    const childDir = path.join(customRoot, 'nested');
    fs.mkdirSync(childDir, { recursive: true });
    tempDirs.push(configuredRoot, customRoot);

    const registry = await createRegistry([configuredRoot]);

    try {
      await registry.addCustomCwd(customRoot);

      const workspaces = await registry.getAllowedWorkspaces();
      expect(workspaces.some((workspace) => workspace.path === configuredRoot)).toBe(true);
      expect(workspaces.some((workspace) => workspace.path === customRoot)).toBe(true);

      await expect(registry.validateCwd(customRoot)).resolves.toBeUndefined();
      await expect(registry.validateCwd(childDir)).resolves.toBeUndefined();
    } finally {
      await registry.close();
    }
  });

  it('rejects relative custom paths', async () => {
    const registry = await createRegistry([process.cwd()]);

    try {
      await expect(registry.addCustomCwd('relative/path')).rejects.toThrow('must be an absolute path');
    } finally {
      await registry.close();
    }
  });
});