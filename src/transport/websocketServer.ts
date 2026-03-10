import { WebSocketServer, WebSocket, type RawData } from 'ws';
import type { IncomingMessage } from 'http';
import { logger } from '../observability/logger.js';
import { parseClientMessage } from '../protocol/validators.js';
import type { ServerMessage } from '../protocol/messages.js';
import type { SessionManager } from '../sessions/SessionManager.js';
import type { CopilotSession } from '../sessions/CopilotSession.js';
import { ContextSearchService } from '../sessions/ContextSearchService.js';
import { extractRequestToken, isValidToken } from '../security/auth.js';
import type { WorkspaceRegistry } from '../workspaces/WorkspaceRegistry.js';

interface LiveWebSocket extends WebSocket {
  isAlive?: boolean;
}

export function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function createWebSocketServer(
  port: number,
  authToken: string,
  sessionManager: SessionManager,
  workspaceRegistry: WorkspaceRegistry,
): WebSocketServer {
  const wss = new WebSocketServer({ port });
  const contextSearchService = new ContextSearchService(workspaceRegistry);
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
    if (token === null || !isValidToken(token, authToken)) {
      logger.warn({ ip: req.socket.remoteAddress }, 'Unauthorized WebSocket connection rejected');
      ws.close(4401, 'Unauthorized');
      return;
    }

    logger.info({ ip: req.socket.remoteAddress }, 'WebSocket client connected');

    // Track session IDs owned by this socket connection
    const ownedSessions = new Set<string>();
    const searchSequenceBySession = new Map<string, number>();

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

        case 'session.create': {
          sessionManager
            .create(msg)
            .then((session: CopilotSession) => {
              ownedSessions.add(session.id);
              send(ws, { type: 'session.ready', sessionId: session.id });

              session.on('output', (data: string) => {
                send(ws, { type: 'terminal.output', sessionId: session.id, data });
              });

              session.on('exit', (exitCode: number | null, signal?: string) => {
                send(ws, { type: 'session.exit', sessionId: session.id, exitCode, signal });
                ownedSessions.delete(session.id);
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
      }
    });

    ws.on('close', () => {
      logger.info({ ip: req.socket.remoteAddress }, 'WebSocket client disconnected');
      for (const sessionId of ownedSessions) {
        const session = sessionManager.get(sessionId);
        if (session) {
          session.kill();
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
