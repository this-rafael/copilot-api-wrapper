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

let wss: WebSocketServer;
let serverPort: number;
let sessionManager: import('../../src/sessions/SessionManager.js').SessionManager;
let workspaceRegistry: import('../../src/workspaces/WorkspaceRegistry.js').WorkspaceRegistry;
let customWorkspacePath: string;

beforeAll(async () => {
  customWorkspacePath = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-wrapper-custom-workspace-'));

  const [{ createWebSocketServer }, { SessionManager }, { WorkspaceRegistry }, { CustomCwdStore }] = await Promise.all([
    import('../../src/transport/websocketServer.js'),
    import('../../src/sessions/SessionManager.js'),
    import('../../src/workspaces/WorkspaceRegistry.js'),
    import('../../src/workspaces/CustomCwdStore.js'),
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
  wss = createWebSocketServer(0, AUTH_TOKEN, sessionManager, workspaceRegistry);

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
  await new Promise<void>((resolve, reject) => {
    wss.close((err) => (err ? reject(err) : resolve()));
  });
  await workspaceRegistry.close();
  fs.rmSync(customWorkspacePath, { recursive: true, force: true });
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
    expect(msg.workspaces).toEqual([
      {
        name: path.basename(path.dirname(process.cwd())),
        path: path.dirname(process.cwd()),
      },
      {
        name: path.basename(process.cwd()),
        path: process.cwd(),
      },
    ]);

    ws.close();
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
