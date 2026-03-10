import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
const tempDirs: string[] = [];

beforeEach(() => {
  process.env['PORT'] = '0';
  process.env['WS_AUTH_TOKEN'] = 'test-secret-token';
  process.env['ALLOWED_CWDS'] = process.cwd();
  process.env['SESSION_TIMEOUT_MS'] = '30000';
  process.env['MAX_SESSIONS'] = '10';
});

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function makeWorkspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-search-'));
  tempDirs.push(root);

  fs.mkdirSync(path.join(root, 'src', 'nested'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src', 'server.ts'), 'export const server = true;\n');
  fs.writeFileSync(path.join(root, 'src', 'nested', 'worker.ts'), 'export const worker = true;\n');
  fs.writeFileSync(path.join(root, 'README.md'), '# temp workspace\n');

  return root;
}

async function createWorkspaceRegistry(allowedCwds: string[]) {
  const dbRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-db-'));
  tempDirs.push(dbRoot);

  const [{ WorkspaceRegistry }, { CustomCwdStore }] = await Promise.all([
    import('../../src/workspaces/WorkspaceRegistry.js'),
    import('../../src/workspaces/CustomCwdStore.js'),
  ]);

  return new WorkspaceRegistry(allowedCwds, new CustomCwdStore(path.join(dbRoot, 'custom-cwds.sqlite')));
}

describe('ContextSearchService', () => {
  it('finds files by partial path and returns relative paths', async () => {
    const cwd = makeWorkspace();
    process.env['ALLOWED_CWDS'] = [cwd, process.cwd()].join(',');
    const { ContextSearchService } = await import('../../src/sessions/ContextSearchService.js');
    const workspaceRegistry = await createWorkspaceRegistry([cwd, process.cwd()]);
    const service = new ContextSearchService(workspaceRegistry);

    try {
      const results = await service.search({
        cwd,
        mentionType: 'file',
        query: 'server',
        limit: 10,
      });

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]?.kind).toBe('file');
      expect(results.some((item) => item.path === 'src/server.ts')).toBe(true);
      expect(results.every((item) => !path.isAbsolute(item.path))).toBe(true);
    } finally {
      await workspaceRegistry.close();
    }
  });

  it('finds folders by partial path', async () => {
    const cwd = makeWorkspace();
    process.env['ALLOWED_CWDS'] = [cwd, process.cwd()].join(',');
    const { ContextSearchService } = await import('../../src/sessions/ContextSearchService.js');
    const workspaceRegistry = await createWorkspaceRegistry([cwd, process.cwd()]);
    const service = new ContextSearchService(workspaceRegistry);

    try {
      const results = await service.search({
        cwd,
        mentionType: 'folder',
        query: 'nest',
        limit: 10,
      });

      expect(results.some((item) => item.path === 'src/nested')).toBe(true);
      expect(results.every((item) => item.kind === 'folder')).toBe(true);
    } finally {
      await workspaceRegistry.close();
    }
  });

  it('returns the workspace item for workspace mentions', async () => {
    const cwd = makeWorkspace();
    process.env['ALLOWED_CWDS'] = [cwd, process.cwd()].join(',');
    const { ContextSearchService } = await import('../../src/sessions/ContextSearchService.js');
    const workspaceRegistry = await createWorkspaceRegistry([cwd, process.cwd()]);
    const service = new ContextSearchService(workspaceRegistry);

    try {
      const results = await service.search({
        cwd,
        mentionType: 'workspace',
        query: '',
      });

      expect(results).toHaveLength(1);
      expect(results[0]).toMatchObject({ kind: 'workspace', path: '.' });
    } finally {
      await workspaceRegistry.close();
    }
  });
});