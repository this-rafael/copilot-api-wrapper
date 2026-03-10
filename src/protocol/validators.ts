import { z } from 'zod';

export const sessionCreateSchema = z.object({
  type: z.literal('session.create'),
  sessionId: z.string().optional(),
  cwd: z.string().min(1),
  commandProfile: z.enum(['copilot-interactive', 'gh-copilot-suggest']),
  cols: z.number().int().positive().optional(),
  rows: z.number().int().positive().optional(),
});

export const terminalInputSchema = z.object({
  type: z.literal('terminal.input'),
  sessionId: z.string().min(1),
  data: z.string(),
});

export const terminalResizeSchema = z.object({
  type: z.literal('terminal.resize'),
  sessionId: z.string().min(1),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
});

export const sessionCloseSchema = z.object({
  type: z.literal('session.close'),
  sessionId: z.string().min(1),
});

export const contextSearchSchema = z.object({
  type: z.literal('context.search'),
  sessionId: z.string().min(1),
  mentionType: z.enum(['file', 'folder', 'workspace']),
  query: z.string(),
  limit: z.number().int().positive().max(50).optional(),
});

export const workspaceListSchema = z.object({
  type: z.literal('workspace.list'),
});

export const workspaceAddCustomSchema = z.object({
  type: z.literal('workspace.addCustom'),
  path: z.string().min(1),
});

const clientMessageSchema = z.discriminatedUnion('type', [
  sessionCreateSchema,
  terminalInputSchema,
  terminalResizeSchema,
  sessionCloseSchema,
  contextSearchSchema,
  workspaceListSchema,
  workspaceAddCustomSchema,
]);

export function parseClientMessage(raw: unknown) {
  return clientMessageSchema.safeParse(raw);
}
