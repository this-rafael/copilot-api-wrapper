import crypto from 'crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { addFirewallRule, removeFirewallRule } from './firewall.js';
import type { RuleStateStore } from './state.js';
import { getLanAddresses } from './lan.js';
import { config } from './config.js';

// ── Argument types inferred from each tool's Zod schema ──────────────────────
const _openPortSchema = z.object({
  port: z.number().int().min(1).max(65535),
  durationSeconds: z.number().int(),
  protocol: z.enum(['tcp', 'udp']).default('tcp'),
  description: z.string().max(120).optional(),
});
type OpenPortArgs = z.infer<typeof _openPortSchema>;

const _closePortSchema = z.object({ ruleId: z.string() });
type ClosePortArgs = z.infer<typeof _closePortSchema>;

function shortId(): string {
  return crypto.randomUUID().replace(/-/g, '').slice(0, 8);
}

/**
 * Creates a fresh McpServer instance with all three tools registered.
 * Callers should create one instance per HTTP request (stateless mode).
 * Tool handlers close over the shared `store` so state is always consistent.
 */
export function createMcpServer(store: RuleStateStore): McpServer {
  const server = new McpServer({
    name: 'open-port-to-lan',
    version: '1.0.0',
  });

  // ── Tool: open-port-to-lan ────────────────────────────────────────────────
  server.tool(
    'open-port-to-lan',
    'Temporarily open a local Windows Firewall inbound rule so a phone or device on the same LAN ' +
      'can reach a service running on this machine. The service must already be listening on ' +
      '0.0.0.0 or the machine LAN IP. Returns the rule ID, expiry time, and LAN access URLs.',
    {
      port: z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe('Local port to open for inbound LAN access'),
      durationSeconds: z
        .number()
        .int()
        .min(config.MIN_TTL_SECONDS)
        .max(config.MAX_TTL_SECONDS)
        .describe(
          `How long to keep the port open (${config.MIN_TTL_SECONDS}–${config.MAX_TTL_SECONDS} seconds)`,
        ),
      protocol: z
        .enum(['tcp', 'udp'])
        .default('tcp')
        .describe('Transport protocol (default: tcp)'),
      description: z
        .string()
        .max(120)
        .optional()
        .describe('Optional label for the audit log (e.g. "dev API server")'),
    },
    async ({ port, durationSeconds, protocol, description }: OpenPortArgs) => {
      const existing = store.findByPort(port);
      if (existing) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'PORT_ALREADY_OPEN',
                message:
                  `Port ${port}/${protocol} already has an active rule (expires ${existing.expiresAt}). ` +
                  `Use close-port with ruleId "${existing.id}" to revoke it first.`,
                ruleId: existing.id,
                expiresAt: existing.expiresAt,
              }),
            },
          ],
          isError: true,
        };
      }

      const id = shortId();
      const ruleName = `MCP-LAN-${port}-${id}`;
      const now = new Date();
      const expiresAt = new Date(now.getTime() + durationSeconds * 1000);

      try {
        addFirewallRule({ ruleName, port, protocol });
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'FIREWALL_COMMAND_FAILED',
                message: `Failed to add firewall rule: ${(err as Error).message}`,
              }),
            },
          ],
          isError: true,
        };
      }

      store.add({
        id,
        ruleName,
        port,
        protocol,
        description: description ?? '',
        createdAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      const lanAddresses = getLanAddresses();
      const schemeMap: Record<number, string> = { 80: 'http', 443: 'https', 8080: 'http' };
      const scheme = schemeMap[port] ?? 'http';

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              ruleId: id,
              ruleName,
              port,
              protocol,
              openedAt: now.toISOString(),
              expiresAt: expiresAt.toISOString(),
              durationSeconds,
              lanAddresses,
              accessUrls: lanAddresses.map((ip) => `${scheme}://${ip}:${port}`),
            }),
          },
        ],
      };
    },
  );

  // ── Tool: close-port ──────────────────────────────────────────────────────
  server.tool(
    'close-port',
    'Revoke a previously opened port rule before its TTL expires. ' +
      'Use the ruleId returned by open-port-to-lan.',
    {
      ruleId: z
        .string()
        .describe('The ruleId returned by a previous open-port-to-lan call'),
    },
    async ({ ruleId }: ClosePortArgs) => {
      const entry = store.findById(ruleId);
      if (!entry) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: 'RULE_NOT_FOUND',
                message: `No active rule found with ruleId "${ruleId}".`,
              }),
            },
          ],
          isError: true,
        };
      }

      removeFirewallRule(entry.ruleName);
      store.remove(entry.id);

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              success: true,
              message: `Port ${entry.port}/${entry.protocol} closed and firewall rule removed.`,
              ruleId: entry.id,
              port: entry.port,
              protocol: entry.protocol,
            }),
          },
        ],
      };
    },
  );

  // ── Tool: list-open-ports ─────────────────────────────────────────────────
  server.tool(
    'list-open-ports',
    'List all ports currently open for LAN access, including remaining TTL for each.',
    async () => {
      const active = store.getActive();
      const now = Date.now();

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              count: active.length,
              ports: active.map((r) => ({
                ruleId: r.id,
                port: r.port,
                protocol: r.protocol,
                description: r.description,
                openedAt: r.createdAt,
                expiresAt: r.expiresAt,
                remainingSeconds: Math.max(
                  0,
                  Math.floor((new Date(r.expiresAt).getTime() - now) / 1000),
                ),
              })),
            }),
          },
        ],
      };
    },
  );

  return server;
}
