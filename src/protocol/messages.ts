// ─── Client → Server messages ────────────────────────────────────────────────

export interface SessionCreateMessage {
  type: 'session.create';
  sessionId?: string;
  cwd: string;
  commandProfile: 'copilot-interactive' | 'gh-copilot-suggest';
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

export type MentionType = 'file' | 'folder' | 'workspace';

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

// ─── Server → Client messages ─────────────────────────────────────────────────

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
  kind: 'file' | 'folder' | 'workspace';
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

// ─── Union types ──────────────────────────────────────────────────────────────

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
