import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import os from 'os';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { WebSocket, WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Set required env vars before config module is loaded
process.env['PORT'] = '0';
process.env['WS_AUTH_TOKEN'] = 'test-secret-token';
process.env['ALLOWED_CWDS'] = `${process.cwd()},${process.cwd()}/,${path.dirname(process.cwd())}`;
process.env['CUSTOM_CWDS_DB_PATH'] = path.join(os.tmpdir(), `copilot-wrapper-${process.pid}-custom-cwds.sqlite`);
process.env['SESSION_TIMEOUT_MS'] = '30000';
process.env['MAX_SESSIONS'] = '10';

const AUTH_TOKEN = 'test-secret-token';
const FAKE_PROCESS = path.resolve(__dirname, '../fixtures/fake-terminal-process.ts');
const FAKE_LSP_PROCESS = path.resolve(__dirname, '../fixtures/fake-copilot-lsp.ts');

let wss: WebSocketServer;
let serverPort: number;
let sessionManager: import('../../src/sessions/SessionManager.js').SessionManager;
let autocompleteManager: import('../../src/autocomplete/AutocompleteManager.js').AutocompleteManager;
let workspaceRegistry: import('../../src/workspaces/WorkspaceRegistry.js').WorkspaceRegistry;
let customWorkspacePath: string;
let gitDiscoveryRoot: string;
let discoveredGitWorkspacePath: string;
let editableFilePath: string;

beforeAll(async () => {
  customWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-custom-workspace-'));
  editableFilePath = path.join(customWorkspacePath, 'notes.md');
  fs.writeFileSync(editableFilePath, '# notes\n\ninitial\n');
  gitDiscoveryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-discovery-root-'));
  discoveredGitWorkspacePath = path.join(gitDiscoveryRoot, 'team-a', 'discovered-repo');
  fs.mkdirSync(path.join(discoveredGitWorkspacePath, '.git'), { recursive: true });
  process.env['ALLOWED_CWDS'] = [
    process.cwd(),
    `${process.cwd()}/`,
    path.dirname(process.cwd()),
    gitDiscoveryRoot,
  ].join(',');

  const [
    { createWebSocketServer },
    { SessionManager },
    { WorkspaceRegistry },
    { CustomCwdStore },
    { AutocompleteManager },
  ] = await Promise.all([
    import('../../src/transport/websocketServer.js'),
    import('../../src/sessions/SessionManager.js'),
    import('../../src/workspaces/WorkspaceRegistry.js'),
    import('../../src/workspaces/CustomCwdStore.js'),
    import('../../src/autocomplete/AutocompleteManager.js'),
  ]);

  workspaceRegistry = new WorkspaceRegistry(
    process.env['ALLOWED_CWDS']?.split(',').map((entry) => entry.trim()).filter(Boolean) ?? [],
    new CustomCwdStore(process.env['CUSTOM_CWDS_DB_PATH'] as string),
  );

  sessionManager = new SessionManager(10, 30000, {
    workspaceRegistry,
    buildCommand: () => ({
      command: 'tsx',
      args: [FAKE_PROCESS],
    }),
  });
  autocompleteManager = new AutocompleteManager({
    buildCommand: () => ({
      command: 'tsx',
      args: [FAKE_LSP_PROCESS],
    }),
  });
  wss = createWebSocketServer(0, AUTH_TOKEN, sessionManager, workspaceRegistry, autocompleteManager);

  await new Promise<void>((resolve) => {
    wss.once('listening', () => {
      const addr = wss.address() as { port: number };
      serverPort = addr.port;
      resolve();
    });
  });
});

afterAll(async () => {
  sessionManager.killAll();
  autocompleteManager.closeAll();
  await new Promise<void>((resolve, reject) => {
    wss.close((err) => (err ? reject(err) : resolve()));
  });
  await workspaceRegistry.close();
  fs.rmSync(customWorkspacePath, { recursive: true, force: true });
  fs.rmSync(gitDiscoveryRoot, { recursive: true, force: true });
  fs.rmSync(process.env['CUSTOM_CWDS_DB_PATH'] as string, { force: true });
});

function connect(token?: string): WebSocket {
  const headers = token ? { Authorization: `Bearer ${token}` } : undefined;
  return new WebSocket(`ws://localhost:${serverPort}`, { headers });
}

function connectWithQueryToken(token: string): WebSocket {
  return new WebSocket(`ws://localhost:${serverPort}?token=${encodeURIComponent(token)}`);
}

function waitForMessage(ws: WebSocket, predicate: (msg: unknown) => boolean, timeoutMs = 4000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout waiting for message')), timeoutMs);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (predicate(msg)) {
        clearTimeout(timer);
        resolve(msg);
      }
    });
  });
}

function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

async function createSession(ws: WebSocket, cwd = process.cwd()): Promise<string> {
  const readyPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.ready');
  ws.send(JSON.stringify({
    type: 'session.create',
    cwd,
    commandProfile: 'copilot-interactive',
  }));

  const ready = await readyPromise as { sessionId: string };
  return ready.sessionId;
}

describe('WebSocket session integration', () => {
  it('rejects connection without token (close code 4401)', async () => {
    const ws = connect(); // no token
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {}); // swallow error
    });
    expect(closeCode).toBe(4401);
  });

  it('rejects connection with wrong token', async () => {
    const ws = connect('wrong-token');
    const closeCode = await new Promise<number>((resolve) => {
      ws.on('close', (code) => resolve(code));
      ws.on('error', () => {});
    });
    expect(closeCode).toBe(4401);
  });

  it('accepts connection with correct token', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('accepts connection with query token for browser clients', async () => {
    const ws = connectWithQueryToken(AUTH_TOKEN);
    await waitForOpen(ws);
    expect(ws.readyState).toBe(WebSocket.OPEN);
    ws.close();
  });

  it('returns session.error for invalid JSON', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const errorMsgPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.error');
    ws.send('not json at all!!!');

    const msg = await errorMsgPromise as { type: string; code: string };
    expect(msg.type).toBe('session.error');
    expect(msg.code).toBe('PARSE_ERROR');
    ws.close();
  });

  it('returns session.error for unknown message type', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const errorMsgPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.error');
    ws.send(JSON.stringify({ type: 'unknown.type', sessionId: 'x' }));

    const msg = await errorMsgPromise as { type: string; code: string };
    expect(msg.type).toBe('session.error');
    expect(msg.code).toBe('VALIDATION_ERROR');
    ws.close();
  });

  it('lists normalized allowed workspaces for authenticated sockets', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const resultsPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string }).type === 'workspace.list.results',
      );

      ws.send(JSON.stringify({ type: 'workspace.list' }));

      const msg = await resultsPromise as {
        type: string;
        workspaces: Array<{ name: string; path: string }>;
      };

      expect(msg.type).toBe('workspace.list.results');
      expect(msg.workspaces).toEqual(expect.arrayContaining([
        {
          name: path.basename(path.dirname(process.cwd())),
          path: path.dirname(process.cwd()),
        },
        {
          name: path.basename(process.cwd()),
          path: process.cwd(),
        },
        {
          name: path.basename(gitDiscoveryRoot),
          path: gitDiscoveryRoot,
        },
      ]));
      expect(msg.workspaces).toHaveLength(3);
    } finally {
      ws.close();
    }
  });

  it('stores a custom workspace and includes it in the workspace catalog', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const resultsPromise = waitForMessage(
      ws,
      (m: unknown) => (m as { type: string }).type === 'workspace.list.results',
    );

    ws.send(JSON.stringify({ type: 'workspace.addCustom', path: customWorkspacePath }));

    const msg = await resultsPromise as {
      type: string;
      workspaces: Array<{ name: string; path: string }>;
    };

    expect(msg.type).toBe('workspace.list.results');
    expect(msg.workspaces.some((workspace) => workspace.path === customWorkspacePath)).toBe(true);
    ws.close();
  });

  it('discovers Git repositories and includes them in the workspace catalog', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const resultsPromise = waitForMessage(
      ws,
      (m: unknown) => (m as { type: string }).type === 'workspace.list.results',
    );

    ws.send(JSON.stringify({ type: 'workspace.discoverGit' }));

    const msg = await resultsPromise as {
      type: string;
      workspaces: Array<{ name: string; path: string }>;
    };

    expect(msg.type).toBe('workspace.list.results');
    expect(msg.workspaces.some((workspace) => workspace.path === discoveredGitWorkspacePath)).toBe(true);
    ws.close();
  });

  it('creates a session with a stored custom workspace', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const readyPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.ready');

    ws.send(JSON.stringify({ type: 'workspace.addCustom', path: customWorkspacePath }));
    await waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'workspace.list.results');

    ws.send(JSON.stringify({
      type: 'session.create',
      cwd: customWorkspacePath,
      commandProfile: 'copilot-interactive',
    }));

    const ready = await readyPromise as { type: string; sessionId: string };
    expect(ready.type).toBe('session.ready');
    ws.close();
  });

  it('creates a fake session and receives terminal output', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    const readyPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.ready');

    ws.send(JSON.stringify({
      type: 'session.create',
      cwd: process.cwd(),
      commandProfile: 'copilot-interactive',
    }));

    const ready = await readyPromise as { type: string; sessionId: string };
    expect(ready.type).toBe('session.ready');

    const output = await waitForMessage(
      ws,
      (m: unknown) => (m as { type: string; data?: string }).type === 'terminal.output'
        && ((m as { data?: string }).data ?? '').includes('READY'),
    ) as { type: string; sessionId: string; data: string };

    expect(output.type).toBe('terminal.output');
    expect(output.sessionId).toBe(ready.sessionId);
    expect(output.data).toContain('READY');
    ws.close();
  });

  it('returns context.search.results for an active session', async () => {
    const ws = connectWithQueryToken(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const readyPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.ready');
      ws.send(JSON.stringify({
        type: 'session.create',
        cwd: process.cwd(),
        commandProfile: 'copilot-interactive',
      }));

      const ready = await readyPromise as { sessionId: string };

      const resultsPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string }).type === 'context.search.results',
      );

      ws.send(JSON.stringify({
        type: 'context.search',
        sessionId: ready.sessionId,
        mentionType: 'file',
        query: 'src/server.ts',
        limit: 20,
      }));

      const results = await resultsPromise as {
        type: string;
        sessionId: string;
        mentionType: string;
        query: string;
        items: Array<{ path: string; kind: string }>;
      };

      expect(results.type).toBe('context.search.results');
      expect(results.sessionId).toBe(ready.sessionId);
      expect(results.mentionType).toBe('file');
      expect(results.items.length).toBeGreaterThan(0);
      expect(results.items.some((item) => item.path.endsWith('server.ts'))).toBe(true);
      expect(results.items.every((item) => item.kind === 'file')).toBe(true);
    } finally {
      ws.close();
    }
  });

  it('returns autocomplete results for an active session', async () => {
    const ws = connectWithQueryToken(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const sessionId = await createSession(ws);

      const resultsPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string; requestId?: number }).type === 'autocomplete.results'
          && (m as { requestId?: number }).requestId === 1,
      );

      ws.send(JSON.stringify({
        type: 'autocomplete.request',
        sessionId,
        requestId: 1,
        text: 'hello',
        cursor: 5,
        languageId: 'markdown',
      }));

      const results = await resultsPromise as {
        type: string;
        sessionId: string;
        requestId: number;
        items: Array<{ insertText: string; replaceStart: number; replaceEnd: number }>;
      };

      expect(results.type).toBe('autocomplete.results');
      expect(results.sessionId).toBe(sessionId);
      expect(results.requestId).toBe(1);
      expect(results.items).toHaveLength(1);
      expect(results.items[0]).toEqual(expect.objectContaining({
        insertText: ' world',
        replaceStart: 5,
        replaceEnd: 5,
      }));
    } finally {
      ws.close();
    }
  });

  it('reads and writes workspace files for an active custom-workspace session', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const sessionId = await createSession(ws, customWorkspacePath);

      const readPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string }).type === 'file.read.results',
      );

      ws.send(JSON.stringify({
        type: 'file.read',
        sessionId,
        path: 'notes.md',
      }));

      const readResult = await readPromise as {
        type: string;
        sessionId: string;
        path: string;
        content: string;
        versionToken: string;
      };

      expect(readResult.type).toBe('file.read.results');
      expect(readResult.sessionId).toBe(sessionId);
      expect(readResult.path).toBe('notes.md');
      expect(readResult.content).toContain('initial');

      const writePromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string }).type === 'file.write.results',
      );

      ws.send(JSON.stringify({
        type: 'file.write',
        sessionId,
        path: 'notes.md',
        content: '# notes\n\nupdated\n',
        versionToken: readResult.versionToken,
      }));

      const writeResult = await writePromise as {
        type: string;
        sessionId: string;
        path: string;
        versionToken: string;
      };

      expect(writeResult.type).toBe('file.write.results');
      expect(writeResult.sessionId).toBe(sessionId);
      expect(writeResult.path).toBe('notes.md');
      expect(writeResult.versionToken).not.toBe(readResult.versionToken);
      expect(fs.readFileSync(editableFilePath, 'utf8')).toContain('updated');
    } finally {
      ws.close();
      fs.writeFileSync(editableFilePath, '# notes\n\ninitial\n');
    }
  });

  it('returns autocomplete results for a real workspace document path', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const sessionId = await createSession(ws, customWorkspacePath);

      const resultsPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string; requestId?: number }).type === 'autocomplete.results'
          && (m as { requestId?: number }).requestId === 7,
      );

      ws.send(JSON.stringify({
        type: 'autocomplete.request',
        sessionId,
        requestId: 7,
        text: '# notes\n\nhello',
        cursor: '# notes\n\nhello'.length,
        documentPath: 'notes.md',
        languageId: 'markdown',
      }));

      const results = await resultsPromise as {
        type: string;
        sessionId: string;
        requestId: number;
        items: Array<{ insertText: string }>;
      };

      expect(results.type).toBe('autocomplete.results');
      expect(results.sessionId).toBe(sessionId);
      expect(results.requestId).toBe(7);
      expect(results.items[0]?.insertText).toBe(' world');
    } finally {
      ws.close();
    }
  });

  it('forwards autocomplete acceptance back to the Copilot LSP bridge', async () => {
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    try {
      const sessionId = await createSession(ws);

      const resultsPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string; requestId?: number }).type === 'autocomplete.results'
          && (m as { requestId?: number }).requestId === 2,
      );

      ws.send(JSON.stringify({
        type: 'autocomplete.request',
        sessionId,
        requestId: 2,
        text: 'console.',
        cursor: 8,
        languageId: 'typescript',
      }));

      const results = await resultsPromise as {
        items: Array<{ id: string; insertText: string }>;
      };

      expect(results.items[0]?.insertText).toBe('log()');

      const acceptedPromise = waitForMessage(
        ws,
        (m: unknown) => (m as { type: string; message?: string }).type === 'autocomplete.status'
          && ((m as { message?: string }).message ?? '').includes('Sugestao aceita'),
      );

      ws.send(JSON.stringify({
        type: 'autocomplete.accept',
        sessionId,
        suggestionId: results.items[0]?.id,
      }));

      const accepted = await acceptedPromise as { type: string; message: string };
      expect(accepted.type).toBe('autocomplete.status');
      expect(accepted.message).toContain('Sugestao aceita: accept:console-log');
    } finally {
      ws.close();
    }
  });

  it('full session lifecycle with fake terminal via CopilotCommandFactory override', async () => {
    // Directly inject a fake CopilotSession to test the WebSocket layer
    const ws = connect(AUTH_TOKEN);
    await waitForOpen(ws);

    // Send a session.create with a cwd outside the allowlist — should get session.error
    const errorPromise = waitForMessage(ws, (m: unknown) => (m as { type: string }).type === 'session.error');

    ws.send(JSON.stringify({
      type: 'session.create',
      cwd: '/not/in/allowlist/at/all',
      commandProfile: 'copilot-interactive',
    }));

    const msg = await errorPromise as { type: string; code: string };
    expect(msg.type).toBe('session.error');
    expect(msg.code).toBe('SESSION_CREATE_FAILED');
    ws.close();
  });
});
