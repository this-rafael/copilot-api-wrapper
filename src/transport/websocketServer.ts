import type { IncomingMessage } from 'http';
import { buildAutocompleteContextPrefix } from '../autocomplete/buildAutocompleteContextPrefix.js';
import type { CopilotResourceCatalog } from '../copilot/CopilotResourceCatalog.js';
import type { AutocompleteManager } from '../autocomplete/AutocompleteManager.js';
import type { WorkspaceTreeBuilder } from '../autocomplete/WorkspaceTreeBuilder.js';
import { GitService } from '../git/GitService.js';
import { logger } from '../observability/logger.js';
import type { ServerMessage } from '../protocol/messages.js';
import { parseClientMessage } from '../protocol/validators.js';
import type { PromptImproverService } from '../prompts/PromptImproverService.js';
import { extractRequestToken, isValidToken } from '../security/auth.js';
import { ContextSearchService } from '../sessions/ContextSearchService.js';
import type { CopilotSession } from '../sessions/CopilotSession.js';
import type { SessionManager } from '../sessions/SessionManager.js';
import { WorkspaceFileService } from '../workspaces/WorkspaceFileService.js';
import type { WorkspaceRegistry } from '../workspaces/WorkspaceRegistry.js';
import { WebSocketServer, WebSocket, type RawData } from 'ws';

interface LiveWebSocket extends WebSocket {
  isAlive?: boolean;
}

interface CreateWebSocketServerOptions {
  enableAutocompleteContext?: boolean;
  workspaceTreeBuilder?: WorkspaceTreeBuilder;
  copilotResourceCatalog?: CopilotResourceCatalog;
  gitService?: GitService;
  promptImproverService?: PromptImproverService;
}

export function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

async function resolveAutocompleteContextPrefix(
  session: CopilotSession,
  options: CreateWebSocketServerOptions,
): Promise<string> {
  if (!options.enableAutocompleteContext || !options.workspaceTreeBuilder) {
    return '';
  }

  const [workspaceTreeResult, recentInteractionsResult] = await Promise.allSettled([
    options.workspaceTreeBuilder.getTree(session.cwd),
    Promise.resolve(session.getRecentInteractionsContext(3)),
  ]);

  const workspaceTree = workspaceTreeResult.status === 'fulfilled' ? workspaceTreeResult.value : '';
  const recentInteractions = recentInteractionsResult.status === 'fulfilled' ? recentInteractionsResult.value : '';

  return buildAutocompleteContextPrefix({
    workspaceTree,
    recentInteractions,
  });
}

export function createWebSocketServer(
  port: number,
  authToken: string | undefined,
  sessionManager: SessionManager,
  workspaceRegistry: WorkspaceRegistry,
  autocompleteManager: AutocompleteManager,
  options: CreateWebSocketServerOptions = {},
): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const contextSearchService = new ContextSearchService(workspaceRegistry);
  const workspaceFileService = new WorkspaceFileService(workspaceRegistry);
  const heartbeatIntervalMs = 30_000;

  const heartbeat = setInterval(() => {
    for (const client of wss.clients) {
      const liveClient = client as LiveWebSocket;
      if (!liveClient.isAlive) {
        liveClient.terminate();
        continue;
      }

      liveClient.isAlive = false;
      liveClient.ping();
    }
  }, heartbeatIntervalMs);

  wss.on('close', () => {
    clearInterval(heartbeat);
  });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const liveSocket = ws as LiveWebSocket;
    liveSocket.isAlive = true;

    const token = extractRequestToken(req);
    if (authToken !== undefined && (token === null || !isValidToken(token, authToken))) {
      logger.warn({ ip: req.socket.remoteAddress }, 'Unauthorized WebSocket connection rejected');
      ws.close(4401, 'Unauthorized');
      return;
    }

    logger.info({ ip: req.socket.remoteAddress }, 'WebSocket client connected');

    const ownedSessions = new Set<string>();
    const searchSequenceBySession = new Map<string, number>();
    const cleanupAutocompleteBySession = new Map<string, () => void>();

    function detachAutocomplete(sessionId: string) {
      cleanupAutocompleteBySession.get(sessionId)?.();
      cleanupAutocompleteBySession.delete(sessionId);
      autocompleteManager.delete(sessionId);
    }

    ws.on('pong', () => {
      liveSocket.isAlive = true;
    });

    ws.on('message', async (raw: RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(raw.toString());
      } catch {
        send(ws, { type: 'session.error', code: 'PARSE_ERROR', message: 'Invalid JSON' });
        return;
      }

      const result = parseClientMessage(parsed);
      if (!result.success) {
        send(ws, {
          type: 'session.error',
          code: 'VALIDATION_ERROR',
          message: result.error.issues.map((i) => i.message).join('; '),
        });
        return;
      }

      const msg = result.data;

      switch (msg.type) {
        case 'workspace.list': {
          try {
            send(ws, {
              type: 'workspace.list.results',
              workspaces: await workspaceRegistry.getAllowedWorkspaces(),
            });
          } catch (err) {
            logger.error({ err }, 'Failed to list workspaces');
            send(ws, {
              type: 'session.error',
              code: 'WORKSPACE_LIST_FAILED',
              message: (err as Error).message,
            });
          }
          break;
        }

        case 'workspace.addCustom': {
          try {
            await workspaceRegistry.addCustomCwd(msg.path);
            send(ws, {
              type: 'workspace.list.results',
              workspaces: await workspaceRegistry.getAllowedWorkspaces(),
            });
          } catch (err) {
            logger.error({ err, path: msg.path }, 'Failed to store custom workspace');
            send(ws, {
              type: 'session.error',
              code: 'WORKSPACE_ADD_CUSTOM_FAILED',
              message: (err as Error).message,
            });
          }
          break;
        }

        case 'workspace.discoverGit': {
          try {
            send(ws, {
              type: 'workspace.list.results',
              workspaces: await workspaceRegistry.discoverGitWorkspaces(),
            });
          } catch (err) {
            logger.error({ err }, 'Failed to discover Git workspaces');
            send(ws, {
              type: 'session.error',
              code: 'WORKSPACE_DISCOVER_GIT_FAILED',
              message: (err as Error).message,
            });
          }
          break;
        }

        case 'copilot.resources.list': {
          if (!options.copilotResourceCatalog) {
            send(ws, {
              type: 'session.error',
              code: 'COPILOT_RESOURCES_UNAVAILABLE',
              message: 'Catalogo de recursos do Copilot nao esta habilitado no servidor.',
            });
            break;
          }

          try {
            send(ws, {
              type: 'copilot.resources.list.results',
              items: await options.copilotResourceCatalog.listResources(),
            });
          } catch (err) {
            logger.error({ err }, 'Failed to list Copilot resources');
            send(ws, {
              type: 'session.error',
              code: 'COPILOT_RESOURCES_LIST_FAILED',
              message: (err as Error).message,
            });
          }
          break;
        }

        case 'session.create': {
          sessionManager
            .create(msg)
            .then((session: CopilotSession) => {
              ownedSessions.add(session.id);
              send(ws, { type: 'session.ready', sessionId: session.id });

              try {
                const autocompleteSession = autocompleteManager.create(session.id, session.cwd);
                const handleAutocompleteStatus = (status: { kind: 'Normal' | 'Warning' | 'Error' | 'Inactive'; message: string }) => {
                  send(ws, {
                    type: 'autocomplete.status',
                    sessionId: session.id,
                    kind: status.kind,
                    message: status.message,
                  });
                };

                autocompleteSession.on('status', handleAutocompleteStatus);
                cleanupAutocompleteBySession.set(session.id, () => {
                  autocompleteSession.off('status', handleAutocompleteStatus);
                });
              } catch (err) {
                logger.error({ err, sessionId: session.id }, 'Failed to start autocomplete session');
                send(ws, {
                  type: 'autocomplete.status',
                  sessionId: session.id,
                  kind: 'Error',
                  message: (err as Error).message,
                });
              }

              session.on('output', (data: string) => {
                send(ws, { type: 'terminal.output', sessionId: session.id, data });
              });

              session.on('exit', (exitCode: number | null, signal?: string) => {
                send(ws, { type: 'session.exit', sessionId: session.id, exitCode, signal });
                ownedSessions.delete(session.id);
                detachAutocomplete(session.id);
                sessionManager.delete(session.id);
              });
            })
            .catch((err: Error) => {
              logger.error({ err }, 'Failed to create session');
              send(ws, {
                type: 'session.error',
                code: 'SESSION_CREATE_FAILED',
                message: err.message,
              });
            });
          break;
        }

        case 'terminal.input': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }
          sessionManager.touch(msg.sessionId);
          session.write(msg.data);
          break;
        }

        case 'terminal.resize': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }
          sessionManager.touch(msg.sessionId);
          session.resize(msg.cols, msg.rows);
          break;
        }

        case 'session.close': {
          const session = sessionManager.get(msg.sessionId);
          if (session) {
            session.kill();
            ownedSessions.delete(msg.sessionId);
            detachAutocomplete(msg.sessionId);
            sessionManager.delete(msg.sessionId);
          }
          break;
        }

        case 'context.search': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }

          sessionManager.touch(msg.sessionId);
          const nextSequence = (searchSequenceBySession.get(msg.sessionId) ?? 0) + 1;
          searchSequenceBySession.set(msg.sessionId, nextSequence);

          contextSearchService
            .search({
              cwd: session.cwd,
              mentionType: msg.mentionType,
              query: msg.query,
              limit: msg.limit,
            })
            .then((items) => {
              if (searchSequenceBySession.get(msg.sessionId) !== nextSequence) {
                return;
              }

              send(ws, {
                type: 'context.search.results',
                sessionId: msg.sessionId,
                mentionType: msg.mentionType,
                query: msg.query,
                items,
              });
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId }, 'Context search failed');
              send(ws, {
                type: 'session.error',
                sessionId: msg.sessionId,
                code: 'CONTEXT_SEARCH_FAILED',
                message: err.message,
              });
            });
          break;
        }

        case 'file.read': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }

          sessionManager.touch(msg.sessionId);
          workspaceFileService
            .readFile(session.cwd, msg.path)
            .then((file) => {
              send(ws, {
                type: 'file.read.results',
                sessionId: msg.sessionId,
                path: file.path,
                content: file.content,
                versionToken: file.versionToken,
              });
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId, path: msg.path }, 'File read failed');
              send(ws, {
                type: 'session.error',
                sessionId: msg.sessionId,
                code: 'FILE_READ_FAILED',
                message: err.message,
              });
            });
          break;
        }

        case 'file.write': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }

          sessionManager.touch(msg.sessionId);
          workspaceFileService
            .writeFile(session.cwd, msg.path, msg.content, msg.versionToken)
            .then((file) => {
              send(ws, {
                type: 'file.write.results',
                sessionId: msg.sessionId,
                path: file.path,
                versionToken: file.versionToken,
              });
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId, path: msg.path }, 'File write failed');
              send(ws, {
                type: 'session.error',
                sessionId: msg.sessionId,
                code: 'FILE_WRITE_FAILED',
                message: err.message,
              });
            });
          break;
        }

        case 'autocomplete.request': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }

          sessionManager.touch(msg.sessionId);

          let autocompleteSession: ReturnType<AutocompleteManager['create']>;
          try {
            autocompleteSession = autocompleteManager.create(msg.sessionId, session.cwd);
            if (!cleanupAutocompleteBySession.has(msg.sessionId)) {
              const handleAutocompleteStatus = (status: {
                kind: 'Normal' | 'Warning' | 'Error' | 'Inactive';
                message: string;
              }) => {
                send(ws, {
                  type: 'autocomplete.status',
                  sessionId: msg.sessionId,
                  kind: status.kind,
                  message: status.message,
                });
              };

              autocompleteSession.on('status', handleAutocompleteStatus);
              cleanupAutocompleteBySession.set(msg.sessionId, () => {
                autocompleteSession.off('status', handleAutocompleteStatus);
              });
            }
          } catch (err) {
            logger.error({ err, sessionId: msg.sessionId }, 'Failed to create autocomplete session');
            send(ws, {
              type: 'autocomplete.status',
              sessionId: msg.sessionId,
              kind: 'Error',
              message: (err as Error).message,
            });
            send(ws, {
              type: 'autocomplete.results',
              sessionId: msg.sessionId,
              requestId: msg.requestId,
              items: [],
            });
            return;
          }

          let documentPath: string | undefined;
          if (msg.documentPath) {
            try {
              documentPath = await workspaceFileService.resolveDocumentPath(session.cwd, msg.documentPath);
            } catch (err) {
              const message = (err as Error).message;
              send(ws, {
                type: 'autocomplete.status',
                sessionId: msg.sessionId,
                kind: 'Error',
                message,
              });
              send(ws, {
                type: 'autocomplete.results',
                sessionId: msg.sessionId,
                requestId: msg.requestId,
                items: [],
              });
              break;
            }
          }

          let contextPrefix = '';
          if (!documentPath) {
            try {
              contextPrefix = await resolveAutocompleteContextPrefix(session, options);
            } catch (err) {
              logger.warn({ err, sessionId: msg.sessionId }, 'Failed to build autocomplete context prefix');
            }
          }

          autocompleteSession
            .requestCompletions({
              text: msg.text,
              cursor: msg.cursor,
              documentPath,
              languageId: msg.languageId,
              tabSize: msg.tabSize,
              insertSpaces: msg.insertSpaces,
              contextPrefix,
            })
            .then((items) => {
              send(ws, {
                type: 'autocomplete.results',
                sessionId: msg.sessionId,
                requestId: msg.requestId,
                items,
              });
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId }, 'Autocomplete request failed');
              send(ws, {
                type: 'autocomplete.status',
                sessionId: msg.sessionId,
                kind: 'Error',
                message: err.message,
              });
              send(ws, {
                type: 'autocomplete.results',
                sessionId: msg.sessionId,
                requestId: msg.requestId,
                items: [],
              });
            });
          break;
        }

        case 'autocomplete.accept': {
          const session = sessionManager.get(msg.sessionId);
          if (!session) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'SESSION_NOT_FOUND',
              message: `Session ${msg.sessionId} not found`,
            });
            return;
          }

          sessionManager.touch(msg.sessionId);
          const autocompleteSession = autocompleteManager.get(msg.sessionId);
          if (!autocompleteSession) {
            send(ws, {
              type: 'session.error',
              sessionId: msg.sessionId,
              code: 'AUTOCOMPLETE_NOT_READY',
              message: 'Autocomplete session is not ready',
            });
            return;
          }

          autocompleteSession
            .acceptSuggestion(msg.suggestionId)
            .then((accepted) => {
              if (!accepted) {
                send(ws, {
                  type: 'session.error',
                  sessionId: msg.sessionId,
                  code: 'AUTOCOMPLETE_SUGGESTION_NOT_FOUND',
                  message: 'Autocomplete suggestion not found',
                });
              }
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId }, 'Autocomplete accept failed');
              send(ws, {
                type: 'session.error',
                sessionId: msg.sessionId,
                code: 'AUTOCOMPLETE_ACCEPT_FAILED',
                message: err.message,
              });
            });
          break;
        }

        case 'prompt.improve.request': {
          const session = sessionManager.get(msg.sessionId);
          const sessionContext = session ? session.getRecentInteractionsContext(10) : '';

          options.promptImproverService!
            .improve(msg.prompt, sessionContext)
            .then((improvedPrompt) => {
              send(ws, {
                type: 'prompt.improve.result',
                sessionId: msg.sessionId,
                improvedPrompt,
              });
            })
            .catch((err: Error) => {
              logger.error({ err, sessionId: msg.sessionId }, 'Prompt Improver failed');
              send(ws, {
                type: 'prompt.improve.error',
                sessionId: msg.sessionId,
                message: err.message,
              });
            });
          break;
        }

        case 'git.status':
        case 'git.diff':
        case 'git.log':
        case 'git.stage':
        case 'git.unstage':
        case 'git.commit':
        case 'git.push':
        case 'git.pull':
        case 'git.branches':
        case 'git.checkout': {
          if (!options.gitService) {
            send(ws, {
              type: 'git.error',
              cwd: msg.cwd,
              code: 'GIT_NOT_ENABLED',
              message: 'Git service is not enabled on this server.',
            });
            break;
          }

          const git = options.gitService;

          if (msg.type === 'git.status') {
            git
              .status(msg.cwd)
              .then((result) => send(ws, { type: 'git.status.results', cwd: msg.cwd, ...result }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git status failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_STATUS_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.diff') {
            git
              .diff(msg.cwd, msg.staged ?? false, msg.path)
              .then((diff) =>
                send(ws, { type: 'git.diff.results', cwd: msg.cwd, staged: msg.staged ?? false, path: msg.path, diff }),
              )
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git diff failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_DIFF_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.log') {
            git
              .log(msg.cwd, msg.maxCount ?? 50)
              .then((commits) => send(ws, { type: 'git.log.results', cwd: msg.cwd, commits }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git log failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_LOG_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.stage') {
            git
              .stage(msg.cwd, msg.paths)
              .then(() => send(ws, { type: 'git.stage.results', cwd: msg.cwd, paths: msg.paths }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git stage failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_STAGE_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.unstage') {
            git
              .unstage(msg.cwd, msg.paths)
              .then(() => send(ws, { type: 'git.unstage.results', cwd: msg.cwd, paths: msg.paths }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git unstage failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_UNSTAGE_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.commit') {
            git
              .commit(msg.cwd, msg.message)
              .then((result) => send(ws, { type: 'git.commit.results', cwd: msg.cwd, ...result }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git commit failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_COMMIT_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.push') {
            git
              .push(msg.cwd, msg.remote, msg.branch)
              .then(() =>
                send(ws, { type: 'git.push.results', cwd: msg.cwd, remote: msg.remote, branch: msg.branch }),
              )
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git push failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_PUSH_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.pull') {
            git
              .pull(msg.cwd, msg.remote, msg.branch)
              .then((summary) =>
                send(ws, {
                  type: 'git.pull.results',
                  cwd: msg.cwd,
                  remote: msg.remote,
                  branch: msg.branch,
                  summary,
                }),
              )
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git pull failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_PULL_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.branches') {
            git
              .branches(msg.cwd)
              .then((result) => send(ws, { type: 'git.branches.results', cwd: msg.cwd, ...result }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git branches failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_BRANCHES_FAILED', message: err.message });
              });
            break;
          }

          if (msg.type === 'git.checkout') {
            git
              .checkout(msg.cwd, msg.branch, msg.createNew ?? false)
              .then(() => send(ws, { type: 'git.checkout.results', cwd: msg.cwd, branch: msg.branch }))
              .catch((err: Error) => {
                logger.error({ err, cwd: msg.cwd }, 'git checkout failed');
                send(ws, { type: 'git.error', cwd: msg.cwd, code: 'GIT_CHECKOUT_FAILED', message: err.message });
              });
            break;
          }

          break;
        }
      }
    });

    ws.on('close', () => {
      logger.info({ ip: req.socket.remoteAddress }, 'WebSocket client disconnected');
      for (const sessionId of ownedSessions) {
        const session = sessionManager.get(sessionId);
        if (session) {
          session.kill();
          detachAutocomplete(sessionId);
          sessionManager.delete(sessionId);
        }
      }
      ownedSessions.clear();
    });

    ws.on('error', (err) => {
      logger.error({ err, ip: req.socket.remoteAddress }, 'WebSocket error');
    });
  });

  wss.on('error', (err) => {
    logger.error({ err }, 'WebSocket server error');
  });

  return wss;
}
