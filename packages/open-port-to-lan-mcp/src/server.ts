import 'dotenv/config';
import http from 'http';
import express, { type Request, type Response, type NextFunction } from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { config } from './config.js';
import { assertElevated } from './elevation.js';
import { removeFirewallRule } from './firewall.js';
import { RuleStateStore } from './state.js';
import { reconcileExpired, startCleanupScheduler } from './scheduler.js';
import { createMcpServer } from './tools.js';

// ── 1. Require admin on Windows ───────────────────────────────────────────────
try {
  assertElevated();
} catch (err) {
  console.error('[startup] ERROR:', (err as Error).message);
  process.exit(1);
}

// ── 2. Shared state store ─────────────────────────────────────────────────────
const store = new RuleStateStore(config.STATE_PATH);

// ── 3. Reconcile left-over rules from previous run ───────────────────────────
console.log('[startup] Reconciling expired rules from previous run...');
reconcileExpired(store);
const activeOnStart = store.getActive();
if (activeOnStart.length > 0) {
  console.log(`[startup] ${activeOnStart.length} rule(s) still active from a previous session.`);
}

// ── 4. TTL cleanup scheduler ──────────────────────────────────────────────────
const cleanupTimer = startCleanupScheduler(store, config.CLEANUP_INTERVAL_MS);

// ── 5. Express app ────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Health check (no auth)
app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', activeRules: store.getActive().length });
});

// Auth + IP allowlist middleware for /mcp
app.use('/mcp', (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token || token !== config.MCP_AUTH_TOKEN) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (config.ALLOWED_IPS.length > 0) {
    const raw =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket.remoteAddress ??
      '';
    // Normalise IPv4-mapped IPv6: "::ffff:192.168.1.5" → "192.168.1.5"
    const clientIp = raw.replace(/^::ffff:/, '');

    if (!config.ALLOWED_IPS.includes(clientIp)) {
      res.status(403).json({ error: 'Forbidden: IP not in allowlist' });
      return;
    }
  }

  next();
});

// MCP endpoint – stateless Streamable HTTP (new transport per request)
const handleMcp = async (req: Request, res: Response): Promise<void> => {
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless mode: no persistent session
  });
  const mcpServer = createMcpServer(store);
  await mcpServer.connect(transport);
  await transport.handleRequest(req, res, req.body);
};

app.post('/mcp', handleMcp);
app.get('/mcp', handleMcp);
app.delete('/mcp', handleMcp);

// ── 6. HTTP server ────────────────────────────────────────────────────────────
const server = http.createServer(app);

server.listen(config.PORT, '0.0.0.0', () => {
  console.log('[server] ─────────────────────────────────────────────────────');
  console.log(`[server] open-port-to-lan MCP server started`);
  console.log(`[server] MCP endpoint : http://0.0.0.0:${config.PORT}/mcp`);
  console.log(`[server] Health check : http://0.0.0.0:${config.PORT}/health`);
  console.log(`[server] Auth         : Bearer token required`);
  if (config.ALLOWED_IPS.length > 0) {
    console.log(`[server] IP allowlist : ${config.ALLOWED_IPS.join(', ')}`);
  } else {
    console.log('[server] IP allowlist : disabled (any IP allowed)');
  }
  console.log(`[server] TTL range    : ${config.MIN_TTL_SECONDS}–${config.MAX_TTL_SECONDS} s`);
  console.log('[server] ─────────────────────────────────────────────────────');
});

// ── 7. Graceful shutdown ──────────────────────────────────────────────────────
async function shutdown(signal: string): Promise<void> {
  console.log(`\n[server] Received ${signal}. Removing all active firewall rules...`);
  clearInterval(cleanupTimer);

  for (const entry of store.getActive()) {
    console.log(`[server] Removing rule "${entry.ruleName}" (port ${entry.port})`);
    removeFirewallRule(entry.ruleName);
    store.remove(entry.id);
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));
  console.log('[server] HTTP server closed. Goodbye.');
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
