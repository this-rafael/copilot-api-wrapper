import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { CopilotAutocompleteSession } from '../../src/autocomplete/CopilotAutocompleteSession.js';

class FakeJsonRpcProcess extends EventEmitter {
  readonly requests: Array<{ method: string; params: unknown }> = [];
  readonly notifications: Array<{ method: string; params: unknown }> = [];

  constructor(
    private readonly handlers: Record<string, (params: unknown) => unknown | Promise<unknown>>,
  ) {
    super();
  }

  request(method: string, params?: unknown): { id: number; promise: Promise<unknown> } {
    this.requests.push({ method, params });
    const handler = this.handlers[method];
    if (!handler) {
      return { id: this.requests.length, promise: Promise.resolve(undefined) };
    }

    return {
      id: this.requests.length,
      promise: Promise.resolve().then(() => handler(params)),
    };
  }

  notify(method: string, params?: unknown): void {
    this.notifications.push({ method, params });
  }

  respond(): void {}

  cancel(): void {}

  kill(): void {
    this.emit('exit', 0, undefined);
  }
}

describe('CopilotAutocompleteSession', () => {
  it('authenticates the language server with the configured GitHub token before requesting completions', async () => {
    const rpc = new FakeJsonRpcProcess({
      initialize: () => ({ capabilities: { textDocumentSync: { change: 2 } } }),
      signInWithGithubToken: () => null,
      checkStatus: () => ({ status: 'OK', user: 'octocat' }),
      'textDocument/inlineCompletion': () => ({ items: [] }),
    });

    const session = new CopilotAutocompleteSession({
      sessionId: 'session-1',
      cwd: '/tmp',
      command: 'node',
      args: ['server.js'],
      env: {},
      githubToken: 'token-from-env',
      githubUser: 'octocat',
      createJsonRpcProcess: () => rpc as never,
    });

    await session.requestCompletions({
      text: 'hello',
      cursor: 5,
    });

    expect(rpc.requests.map((entry) => entry.method)).toEqual([
      'initialize',
      'signInWithGithubToken',
      'checkStatus',
      'textDocument/inlineCompletion',
    ]);

    expect(rpc.requests[1]?.params).toEqual({
      githubToken: 'token-from-env',
      user: 'octocat',
    });
  });

  it('fails fast when the configured GitHub token is rejected by the language server', async () => {
    const rpc = new FakeJsonRpcProcess({
      initialize: () => ({ capabilities: { textDocumentSync: { change: 2 } } }),
      signInWithGithubToken: () => null,
      checkStatus: () => ({ status: 'NotAuthorized' }),
    });

    const session = new CopilotAutocompleteSession({
      sessionId: 'session-2',
      cwd: '/tmp',
      command: 'node',
      args: ['server.js'],
      env: {},
      githubToken: 'bad-token',
      githubUser: 'octocat',
      createJsonRpcProcess: () => rpc as never,
    });

    await expect(session.requestCompletions({
      text: 'hello',
      cursor: 5,
    })).rejects.toThrow('O token configurado para o autocomplete foi rejeitado pelo Copilot (NotAuthorized).');
  });

  it('resolves the GitHub user from the token when no user hint is configured', async () => {
    const rpc = new FakeJsonRpcProcess({
      initialize: () => ({ capabilities: { textDocumentSync: { change: 2 } } }),
      signInWithGithubToken: () => null,
      checkStatus: () => ({ status: 'OK', user: 'octocat' }),
      'textDocument/inlineCompletion': () => ({ items: [] }),
    });
    const fetchGitHubUser = vi.fn().mockResolvedValue('octocat');

    const session = new CopilotAutocompleteSession({
      sessionId: 'session-3',
      cwd: '/tmp',
      command: 'node',
      args: ['server.js'],
      env: {},
      githubToken: 'token-from-env',
      createJsonRpcProcess: () => rpc as never,
      fetchGitHubUser,
    });

    await session.requestCompletions({
      text: 'hello',
      cursor: 5,
    });

    expect(fetchGitHubUser).toHaveBeenCalledWith('token-from-env');
    expect(rpc.requests[1]?.params).toEqual({
      githubToken: 'token-from-env',
      user: 'octocat',
    });
  });

  it('sends the selected completion model through github.copilot configuration', async () => {
    const rpc = new FakeJsonRpcProcess({
      initialize: () => ({ capabilities: { textDocumentSync: { change: 2 } } }),
      'textDocument/inlineCompletion': () => ({ items: [] }),
    });

    const session = new CopilotAutocompleteSession({
      sessionId: 'session-4',
      cwd: '/tmp',
      command: 'node',
      args: ['server.js'],
      env: {},
      selectedCompletionModel: 'raptor-mini',
      createJsonRpcProcess: () => rpc as never,
    });

    await session.requestCompletions({
      text: 'hello',
      cursor: 5,
    });

    expect(rpc.notifications).toContainEqual({
      method: 'workspace/didChangeConfiguration',
      params: {
        settings: {
          telemetry: {
            telemetryLevel: 'all',
          },
          github: {
            copilot: {
              editor: {
                showEditorCompletions: true,
                enableAutoCompletions: true,
              },
              selectedCompletionModel: 'raptor-mini',
            },
          },
        },
      },
    });
  });

  it('prefixes context into the virtual document and maps completion ranges back to the original prompt', async () => {
    const rpc = new FakeJsonRpcProcess({
      initialize: () => ({ capabilities: { textDocumentSync: { change: 2 } } }),
      'textDocument/inlineCompletion': (params) => {
        expect(params).toMatchObject({
          position: {
            line: 1,
            character: 5,
          },
        });
        return {
          items: [
            {
              insertText: ' world',
            },
          ],
        };
      },
    });

    const session = new CopilotAutocompleteSession({
      sessionId: 'session-5',
      cwd: '/tmp',
      command: 'node',
      args: ['server.js'],
      env: {},
      createJsonRpcProcess: () => rpc as never,
    });

    const items = await session.requestCompletions({
      text: 'hello',
      cursor: 5,
      contextPrefix: 'ctx\n',
    });

    expect(rpc.notifications).toContainEqual({
      method: 'textDocument/didOpen',
      params: {
        textDocument: {
          uri: 'file:///tmp/.copilot-wrapper-prompt.md',
          languageId: 'markdown',
          version: 1,
          text: 'ctx\nhello',
        },
      },
    });

    expect(items).toEqual([
      {
        id: expect.any(String),
        insertText: ' world',
        replaceStart: 5,
        replaceEnd: 5,
      },
    ]);
  });
});
