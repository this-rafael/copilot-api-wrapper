export type CommandProfile = 'copilot-interactive' | 'gh-copilot-suggest';
export type MentionType = 'file' | 'folder' | 'workspace';

export interface SessionCreateMessage {
  type: 'session.create';
  cwd: string;
  commandProfile: CommandProfile;
  cols?: number;
  rows?: number;
}

export interface TerminalInputMessage {
  type: 'terminal.input';
  sessionId: string;
  data: string;
}

export interface TerminalResizeMessage {
  type: 'terminal.resize';
  sessionId: string;
  cols: number;
  rows: number;
}

export interface SessionCloseMessage {
  type: 'session.close';
  sessionId: string;
}

export interface ContextSearchMessage {
  type: 'context.search';
  sessionId: string;
  mentionType: MentionType;
  query: string;
  limit?: number;
}

export interface WorkspaceListMessage {
  type: 'workspace.list';
}

export interface WorkspaceAddCustomMessage {
  type: 'workspace.addCustom';
  path: string;
}

export interface SessionReadyMessage {
  type: 'session.ready';
  sessionId: string;
}

export interface TerminalOutputMessage {
  type: 'terminal.output';
  sessionId: string;
  data: string;
}

export interface SessionExitMessage {
  type: 'session.exit';
  sessionId: string;
  exitCode: number | null;
  signal?: string;
}

export interface SessionErrorMessage {
  type: 'session.error';
  sessionId?: string;
  code: string;
  message: string;
}

export interface ContextSearchItem {
  id: string;
  kind: MentionType;
  label: string;
  path: string;
  description: string;
}

export interface ContextSearchResultsMessage {
  type: 'context.search.results';
  sessionId: string;
  mentionType: MentionType;
  query: string;
  items: ContextSearchItem[];
}

export interface WorkspaceInfo {
  name: string;
  path: string;
}

export interface WorkspaceListResultsMessage {
  type: 'workspace.list.results';
  workspaces: WorkspaceInfo[];
}

export type ClientMessage =
  | SessionCreateMessage
  | TerminalInputMessage
  | TerminalResizeMessage
  | SessionCloseMessage
  | ContextSearchMessage
  | WorkspaceListMessage
  | WorkspaceAddCustomMessage;

export type ServerMessage =
  | SessionReadyMessage
  | TerminalOutputMessage
  | SessionExitMessage
  | SessionErrorMessage
  | ContextSearchResultsMessage
  | WorkspaceListResultsMessage;

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === 'string';
}