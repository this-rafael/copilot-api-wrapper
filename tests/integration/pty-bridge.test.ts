import { describe, it, expect, afterEach } from 'vitest';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CopilotSession } from '../../src/sessions/CopilotSession.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fakeProcessPath = path.resolve(__dirname, '../fixtures/fake-terminal-process.ts');

async function waitForOutput(
  session: CopilotSession,
  predicate: (collected: string) => boolean,
  timeoutMs = 3000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let collected = '';
    const timer = setTimeout(() => reject(new Error(`Timeout. Collected: ${JSON.stringify(collected)}`)), timeoutMs);

    session.on('output', (data: string) => {
      collected += data;
      if (predicate(collected)) {
        clearTimeout(timer);
        resolve(collected);
      }
    });
  });
}

describe('CopilotSession PTY bridge', () => {
  const sessions: CopilotSession[] = [];

  afterEach(() => {
    for (const s of sessions) {
      s.kill();
    }
    sessions.length = 0;
  });

  function makeSession(extraArgs: string[] = [], cols = 80, rows = 24): CopilotSession {
    const session = new CopilotSession({
      id: 'test-' + Date.now(),
      command: 'tsx',
      args: [fakeProcessPath, ...extraArgs],
      cwd: process.cwd(),
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
      cols,
      rows,
    });
    sessions.push(session);
    return session;
  }

  it('receives READY on startup', async () => {
    const session = makeSession();
    const output = await waitForOutput(session, (s) => s.includes('READY'));
    expect(output).toContain('READY');
  });

  it('echoes input back', async () => {
    const session = makeSession();
    await waitForOutput(session, (s) => s.includes('READY'));

    const outputPromise = waitForOutput(session, (s) => s.includes('ECHO: hello'));
    session.write('hello\n');
    const output = await outputPromise;
    expect(output).toContain('ECHO: hello');
  });

  it('exits cleanly when EXIT command is sent', async () => {
    const session = makeSession();
    await waitForOutput(session, (s) => s.includes('READY'));

    const exitPromise = new Promise<{ exitCode: number | null }>((resolve) => {
      session.on('exit', (exitCode: number | null) => resolve({ exitCode }));
    });

    session.write('EXIT\n');
    const { exitCode } = await exitPromise;
    expect(exitCode).toBe(0);
  });

  it('kill() terminates the PTY process', async () => {
    const session = makeSession();
    await waitForOutput(session, (s) => s.includes('READY'));

    const exitPromise = new Promise<void>((resolve) => {
      session.on('exit', () => resolve());
    });

    session.kill('SIGKILL');
    await exitPromise;
    expect(session.exited).toBe(true);
  });

  it('resize changes PTY dimensions without crashing', async () => {
    const session = makeSession([], 80, 24);
    await waitForOutput(session, (s) => s.includes('READY'));
    // resize should not throw
    expect(() => session.resize(120, 40)).not.toThrow();
  });
});
