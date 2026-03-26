import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

function makeTempDir(prefix: string): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(directory);
  return directory;
}

async function createWorkspaceRegistry(allowedCwds: string[]) {
  const dbRoot = makeTempDir('copilot-resource-db-');
  const [{ WorkspaceRegistry }, { CustomCwdStore }] = await Promise.all([
    import('../../src/workspaces/WorkspaceRegistry.js'),
    import('../../src/workspaces/CustomCwdStore.js'),
  ]);

  return new WorkspaceRegistry(allowedCwds, new CustomCwdStore(path.join(dbRoot, 'custom-cwds.sqlite')));
}

describe('CopilotResourceCatalog', () => {
  it('discovers skills, prompts and MCP configs from workspace ancestors and local config dirs', async () => {
    const homeDir = makeTempDir('copilot-resource-home-');
    const monorepoRoot = makeTempDir('copilot-resource-monorepo-');
    const workspacePath = path.join(monorepoRoot, 'packages', 'mobile-client');
    fs.mkdirSync(workspacePath, { recursive: true });

    fs.mkdirSync(path.join(monorepoRoot, '.github', 'skills', 'review-flow'), { recursive: true });
    fs.writeFileSync(
      path.join(monorepoRoot, '.github', 'skills', 'review-flow', 'SKILL.md'),
      ['---', 'name: review-flow', 'description: Faz revisoes padronizadas', '---', '', '# Review flow'].join('\n'),
    );

    fs.mkdirSync(path.join(monorepoRoot, '.github', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(monorepoRoot, '.github', 'prompts', 'fix-bug.prompt.md'),
      ['---', 'description: Prompt para corrigir bugs', '---', '', '# Fix bug'].join('\n'),
    );

    fs.mkdirSync(path.join(monorepoRoot, '.vscode'), { recursive: true });
    fs.writeFileSync(
      path.join(monorepoRoot, '.vscode', 'mcp.json'),
      JSON.stringify({
        'open-port-to-lan': {
          type: 'http',
          url: 'http://127.0.0.1:3741/mcp',
        },
      }),
    );

    fs.mkdirSync(path.join(homeDir, '.copilot', 'skills', 'deploy-preview'), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, '.copilot', 'skills', 'deploy-preview', 'SKILL.md'),
      ['---', 'name: deploy-preview', 'description: Publica um preview de deploy', '---', '', '# Deploy'].join('\n'),
    );

    fs.mkdirSync(path.join(homeDir, '.copilot', 'prompts'), { recursive: true });
    fs.writeFileSync(
      path.join(homeDir, '.copilot', 'prompts', 'release-note.prompt.md'),
      ['---', 'description: Gera release notes', '---', '', '# Release notes'].join('\n'),
    );

    fs.writeFileSync(
      path.join(homeDir, '.copilot', 'mcp.json'),
      JSON.stringify({
        servers: {
          github: {
            command: 'github-mcp-server',
          },
        },
      }),
    );

    const workspaceRegistry = await createWorkspaceRegistry([workspacePath]);
    const { CopilotResourceCatalog } = await import('../../src/copilot/CopilotResourceCatalog.js');
    const catalog = new CopilotResourceCatalog(workspaceRegistry, { homeDir });

    try {
      const items = await catalog.listResources();

      expect(items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            kind: 'skill',
            scope: 'workspace',
            label: 'review-flow',
            invocation: '/review-flow ',
            originLabel: 'mobile-client',
          }),
          expect.objectContaining({
            kind: 'prompt',
            scope: 'workspace',
            label: 'fix-bug',
            invocation: '/fix-bug ',
          }),
          expect.objectContaining({
            kind: 'mcp',
            scope: 'workspace',
            label: 'open-port-to-lan',
            invocation: '/mcp show open-port-to-lan',
          }),
          expect.objectContaining({
            kind: 'skill',
            scope: 'local',
            label: 'deploy-preview',
            invocation: '/deploy-preview ',
            originLabel: 'Pessoal',
          }),
          expect.objectContaining({
            kind: 'prompt',
            scope: 'local',
            label: 'release-note',
            invocation: '/release-note ',
          }),
          expect.objectContaining({
            kind: 'mcp',
            scope: 'local',
            label: 'github',
            invocation: '/mcp show github',
          }),
        ]),
      );
    } finally {
      await workspaceRegistry.close();
    }
  });
});