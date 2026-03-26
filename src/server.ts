import 'dotenv/config';
import path from 'path';
import { AutocompleteManager } from './autocomplete/AutocompleteManager.js';
import { CopilotResourceCatalog } from './copilot/CopilotResourceCatalog.js';
import { WorkspaceTreeBuilder } from './autocomplete/WorkspaceTreeBuilder.js';
import { config } from './config.js';
import { resolveGitHubToken } from './cli/environment.js';
import { GitService } from './git/GitService.js';
import { logger } from './observability/logger.js';
import { PromptImproverService } from './prompts/PromptImproverService.js';
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
const autocompleteManager = new AutocompleteManager({
  customServerPath: config.COPILOT_LSP_PATH,
  selectedCompletionModel: config.AUTOCOMPLETE_MODEL,
});
const workspaceTreeBuilder = new WorkspaceTreeBuilder();
const copilotResourceCatalog = new CopilotResourceCatalog(workspaceRegistry);
const gitService = new GitService();
const githubToken = resolveGitHubToken(process.env as Record<string, string | undefined>);
const promptImproverService = new PromptImproverService(githubToken);

if (!githubToken) {
  logger.warn('No GitHub token found in environment — Prompt Improver will fall back to `gh auth token` at call time');
}

const wss = createWebSocketServer(
  config.PORT,
  config.AUTH_DISABLED ? undefined : config.WS_AUTH_TOKEN,
  sessionManager,
  workspaceRegistry,
  autocompleteManager,
  {
    enableAutocompleteContext: config.AUTOCOMPLETE_CONTEXT_ENABLED,
    workspaceTreeBuilder,
    copilotResourceCatalog,
    gitService,
    promptImproverService,
  },
);

wss.on('listening', () => {
  logger.info({ port: config.PORT }, 'WebSocket server started');
});

async function shutdown(signal: string) {
  logger.info({ signal }, 'Received shutdown signal, closing gracefully');
  sessionManager.killAll();
  autocompleteManager.closeAll();
  workspaceTreeBuilder.close();

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
