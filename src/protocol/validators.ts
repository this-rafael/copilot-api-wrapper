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

export const workspaceDiscoverGitSchema = z.object({
  type: z.literal('workspace.discoverGit'),
});

export const fileReadSchema = z.object({
  type: z.literal('file.read'),
  sessionId: z.string().min(1),
  path: z.string().trim().min(1),
});

export const fileWriteSchema = z.object({
  type: z.literal('file.write'),
  sessionId: z.string().min(1),
  path: z.string().trim().min(1),
  content: z.string(),
  versionToken: z.string().trim().min(1),
});

export const copilotResourcesListSchema = z.object({
  type: z.literal('copilot.resources.list'),
});

export const autocompleteRequestSchema = z.object({
  type: z.literal('autocomplete.request'),
  sessionId: z.string().min(1),
  requestId: z.number().int().nonnegative(),
  text: z.string(),
  cursor: z.number().int().nonnegative(),
  documentPath: z.string().trim().min(1).optional(),
  languageId: z.string().trim().min(1).optional(),
  tabSize: z.number().int().positive().max(8).optional(),
  insertSpaces: z.boolean().optional(),
});

export const autocompleteAcceptSchema = z.object({
  type: z.literal('autocomplete.accept'),
  sessionId: z.string().min(1),
  suggestionId: z.string().min(1),
});

export const gitStatusSchema = z.object({
  type: z.literal('git.status'),
  cwd: z.string().min(1),
});

export const gitDiffSchema = z.object({
  type: z.literal('git.diff'),
  cwd: z.string().min(1),
  staged: z.boolean().optional(),
  path: z.string().min(1).optional(),
});

export const gitLogSchema = z.object({
  type: z.literal('git.log'),
  cwd: z.string().min(1),
  maxCount: z.number().int().positive().max(200).optional(),
});

export const gitStageSchema = z.object({
  type: z.literal('git.stage'),
  cwd: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
});

export const gitUnstageSchema = z.object({
  type: z.literal('git.unstage'),
  cwd: z.string().min(1),
  paths: z.array(z.string().min(1)).min(1),
});

export const gitCommitSchema = z.object({
  type: z.literal('git.commit'),
  cwd: z.string().min(1),
  message: z.string().min(1),
});

export const gitPushSchema = z.object({
  type: z.literal('git.push'),
  cwd: z.string().min(1),
  remote: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
});

export const gitPullSchema = z.object({
  type: z.literal('git.pull'),
  cwd: z.string().min(1),
  remote: z.string().min(1).optional(),
  branch: z.string().min(1).optional(),
});

export const gitBranchesSchema = z.object({
  type: z.literal('git.branches'),
  cwd: z.string().min(1),
});

export const gitCheckoutSchema = z.object({
  type: z.literal('git.checkout'),
  cwd: z.string().min(1),
  branch: z.string().min(1),
  createNew: z.boolean().optional(),
});

export const promptImproveRequestSchema = z.object({
  type: z.literal('prompt.improve.request'),
  sessionId: z.string().min(1),
  prompt: z.string().min(1).max(50_000),
});

const clientMessageSchema = z.discriminatedUnion('type', [
  sessionCreateSchema,
  terminalInputSchema,
  terminalResizeSchema,
  sessionCloseSchema,
  contextSearchSchema,
  workspaceListSchema,
  workspaceAddCustomSchema,
  workspaceDiscoverGitSchema,
  fileReadSchema,
  fileWriteSchema,
  copilotResourcesListSchema,
  autocompleteRequestSchema,
  autocompleteAcceptSchema,
  gitStatusSchema,
  gitDiffSchema,
  gitLogSchema,
  gitStageSchema,
  gitUnstageSchema,
  gitCommitSchema,
  gitPushSchema,
  gitPullSchema,
  gitBranchesSchema,
  gitCheckoutSchema,
  promptImproveRequestSchema,
]);

export function parseClientMessage(raw: unknown) {
  return clientMessageSchema.safeParse(raw);
}
