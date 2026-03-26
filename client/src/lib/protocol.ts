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

export interface WorkspaceDiscoverGitMessage {
  type: 'workspace.discoverGit';
}

export interface FileReadMessage {
  type: 'file.read';
  sessionId: string;
  path: string;
}

export interface FileWriteMessage {
  type: 'file.write';
  sessionId: string;
  path: string;
  content: string;
  versionToken: string;
}

export interface CopilotResourcesListMessage {
  type: 'copilot.resources.list';
}

export interface AutocompleteRequestMessage {
  type: 'autocomplete.request';
  sessionId: string;
  requestId: number;
  text: string;
  cursor: number;
  documentPath?: string;
  languageId?: string;
  tabSize?: number;
  insertSpaces?: boolean;
}

export interface AutocompleteAcceptMessage {
  type: 'autocomplete.accept';
  sessionId: string;
  suggestionId: string;
}

export interface PromptImproveRequestMessage {
  type: 'prompt.improve.request';
  sessionId: string;
  prompt: string;
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

export interface FileReadResultsMessage {
  type: 'file.read.results';
  sessionId: string;
  path: string;
  content: string;
  versionToken: string;
}

export interface FileWriteResultsMessage {
  type: 'file.write.results';
  sessionId: string;
  path: string;
  versionToken: string;
}

export type CopilotResourceKind = 'skill' | 'prompt' | 'mcp';
export type CopilotResourceScope = 'workspace' | 'local';

export interface CopilotResourceItem {
  id: string;
  kind: CopilotResourceKind;
  scope: CopilotResourceScope;
  label: string;
  description: string;
  invocation: string;
  sourcePath: string;
  originLabel: string;
  workspacePath?: string;
}

export interface CopilotResourcesListResultsMessage {
  type: 'copilot.resources.list.results';
  items: CopilotResourceItem[];
}

export type AutocompleteStatusKind = 'Normal' | 'Warning' | 'Error' | 'Inactive';

export interface PromptAutocompleteSuggestion {
  id: string;
  insertText: string;
  replaceStart: number;
  replaceEnd: number;
}

export interface AutocompleteResultsMessage {
  type: 'autocomplete.results';
  sessionId: string;
  requestId: number;
  items: PromptAutocompleteSuggestion[];
}

export interface AutocompleteStatusMessage {
  type: 'autocomplete.status';
  sessionId: string;
  kind: AutocompleteStatusKind;
  message: string;
}

export interface GitStatusMessage { type: 'git.status'; cwd: string; }
export interface GitDiffMessage { type: 'git.diff'; cwd: string; staged?: boolean; path?: string; }
export interface GitLogMessage { type: 'git.log'; cwd: string; maxCount?: number; }
export interface GitStageMessage { type: 'git.stage'; cwd: string; paths: string[]; }
export interface GitUnstageMessage { type: 'git.unstage'; cwd: string; paths: string[]; }
export interface GitCommitMessage { type: 'git.commit'; cwd: string; message: string; }
export interface GitPushMessage { type: 'git.push'; cwd: string; remote?: string; branch?: string; }
export interface GitPullMessage { type: 'git.pull'; cwd: string; remote?: string; branch?: string; }
export interface GitBranchesMessage { type: 'git.branches'; cwd: string; }
export interface GitCheckoutMessage { type: 'git.checkout'; cwd: string; branch: string; createNew?: boolean; }

export interface GitFileChange { path: string; index: string; working_dir: string; }
export interface GitStatusResultMessage {
  type: 'git.status.results'; cwd: string;
  branch: string | null; tracking: string | null;
  ahead: number; behind: number;
  staged: GitFileChange[]; unstaged: GitFileChange[];
  untracked: string[]; conflicted: string[];
}
export interface GitDiffResultMessage { type: 'git.diff.results'; cwd: string; staged: boolean; path?: string; diff: string; }
export interface GitCommitInfo { hash: string; date: string; message: string; author_name: string; author_email: string; }
export interface GitLogResultMessage { type: 'git.log.results'; cwd: string; commits: GitCommitInfo[]; }
export interface GitStageResultMessage { type: 'git.stage.results'; cwd: string; paths: string[]; }
export interface GitUnstageResultMessage { type: 'git.unstage.results'; cwd: string; paths: string[]; }
export interface GitCommitResultMessage { type: 'git.commit.results'; cwd: string; hash: string; message: string; }
export interface GitPushResultMessage { type: 'git.push.results'; cwd: string; remote?: string; branch?: string; }
export interface GitPullResultMessage { type: 'git.pull.results'; cwd: string; remote?: string; branch?: string; summary: string; }
export interface GitBranchInfo { name: string; current: boolean; remote: boolean; label: string; }
export interface GitBranchesResultMessage { type: 'git.branches.results'; cwd: string; current: string; branches: GitBranchInfo[]; }
export interface GitCheckoutResultMessage { type: 'git.checkout.results'; cwd: string; branch: string; }
export interface GitErrorMessage { type: 'git.error'; cwd: string; code: string; message: string; }

export interface PromptImproveResultMessage {
  type: 'prompt.improve.result';
  sessionId: string;
  improvedPrompt: string;
}

export interface PromptImproveErrorMessage {
  type: 'prompt.improve.error';
  sessionId: string;
  message: string;
}

export type ClientMessage =
  | SessionCreateMessage
  | TerminalInputMessage
  | TerminalResizeMessage
  | SessionCloseMessage
  | ContextSearchMessage
  | WorkspaceListMessage
  | WorkspaceAddCustomMessage
  | WorkspaceDiscoverGitMessage
  | FileReadMessage
  | FileWriteMessage
  | CopilotResourcesListMessage
  | AutocompleteRequestMessage
  | AutocompleteAcceptMessage
  | GitStatusMessage
  | GitDiffMessage
  | GitLogMessage
  | GitStageMessage
  | GitUnstageMessage
  | GitCommitMessage
  | GitPushMessage
  | GitPullMessage
  | GitBranchesMessage
  | GitCheckoutMessage
  | PromptImproveRequestMessage;

export type ServerMessage =
  | SessionReadyMessage
  | TerminalOutputMessage
  | SessionExitMessage
  | SessionErrorMessage
  | ContextSearchResultsMessage
  | WorkspaceListResultsMessage
  | FileReadResultsMessage
  | FileWriteResultsMessage
  | CopilotResourcesListResultsMessage
  | AutocompleteResultsMessage
  | AutocompleteStatusMessage
  | GitStatusResultMessage
  | GitDiffResultMessage
  | GitLogResultMessage
  | GitStageResultMessage
  | GitUnstageResultMessage
  | GitCommitResultMessage
  | GitPushResultMessage
  | GitPullResultMessage
  | GitBranchesResultMessage
  | GitCheckoutResultMessage
  | GitErrorMessage
  | PromptImproveResultMessage
  | PromptImproveErrorMessage;

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const type = (value as { type?: unknown }).type;
  return typeof type === 'string';
}
