import 'dotenv/config';
import path from 'path';
import { config } from './config.js';
import { logger } from './observability/logger.js';
import { SessionManager } from './sessions/SessionManager.js';
import { createWebSocketServer } from './transport/websocketServer.js';
import { CustomCwdStore } from './workspaces/CustomCwdStore.js';
import { WorkspaceRegistry } from './workspaces/WorkspaceRegistry.js';

const workspaceRegistry = new WorkspaceRegistry(
  config.ALLOWED_CWDS,
  new CustomCwdStore(path.resolve(config.CUSTOM_CWDS_DB_PATH)),
);
const sessionManager = new SessionManager(config.MAX_SESSIONS, config.SESSION_TIMEOUT_MS, {
  workspaceRegistry,
});
const wss = createWebSocketServer(config.PORT, config.WS_AUTH_TOKEN, sessionManager, workspaceRegistry);

wss.on('listening', () => {
  logger.info({ port: config.PORT }, 'WebSocket server started');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing gracefully');
  sessionManager.killAll();

  try {
    await new Promise<void>((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()));
    });
    await workspaceRegistry.close();
    logger.info('WebSocket server closed');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error closing WebSocket server');
    process.exit(1);
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
