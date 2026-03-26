import { EventEmitter } from 'events';
import path from 'path';
import { pathToFileURL } from 'url';
import { nanoid } from 'nanoid';
import { logger } from '../observability/logger.js';
import { JsonRpcProcess, type JsonRpcId } from '../lsp/JsonRpcProcess.js';
import type { AutocompleteStatusKind, PromptAutocompleteSuggestion } from '../protocol/messages.js';

interface LspPosition {
  line: number;
  character: number;
}

interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

interface LspCommand {
  title?: string;
  command: string;
  arguments?: unknown[];
}

interface InlineCompletionItem {
  insertText: string;
  range?: LspRange;
  command?: LspCommand;
}

interface InlineCompletionResult {
  items?: InlineCompletionItem[];
}

interface StatusParams {
  kind?: AutocompleteStatusKind;
  message?: string;
}

interface WindowShowMessageRequestParams {
  type?: number;
  message?: string;
}

interface CopilotAutocompleteSessionOptions {
  sessionId: string;
  cwd: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  githubToken?: string;
  githubUser?: string;
  selectedCompletionModel?: string;
  createJsonRpcProcess?: (options: {
    command: string;
    args: string[];
    cwd: string;
    env: Record<string, string>;
  }) => JsonRpcProcess;
  fetchGitHubUser?: (githubToken: string) => Promise<string>;
}

interface DocumentState {
  uri: string;
  text: string;
  version: number;
  languageId: string;
  documentPath: string | null;
  opened: boolean;
}

interface StoredSuggestion {
  item: InlineCompletionItem;
}

const TEXT_DOCUMENT_SYNC_INCREMENTAL = 2;
const DEFAULT_LANGUAGE_ID = 'markdown';
const DEFAULT_TAB_SIZE = 2;
const WRAPPER_VERSION = '1.0.0';
const VALID_AUTH_STATUSES = new Set(['OK', 'MaybeOK', 'AlreadySignedIn']);

async function fetchGitHubUser(githubToken: string): Promise<string> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `token ${githubToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'copilot-api-wrapper',
    },
  });

  if (!response.ok) {
    throw new Error(`Nao foi possivel identificar o usuario do token GitHub (${response.status} ${response.statusText}).`);
  }

  const payload = await response.json() as { login?: unknown };
  if (typeof payload.login !== 'string' || payload.login.trim().length === 0) {
    throw new Error('Nao foi possivel identificar o login do GitHub para autenticar o autocomplete.');
  }

  return payload.login;
}

function positionFromOffset(text: string, offset: number): LspPosition {
  const clampedOffset = Math.max(0, Math.min(offset, text.length));
  let line = 0;
  let lineStart = 0;

  for (let index = 0; index < clampedOffset; index += 1) {
    if (text.charCodeAt(index) === 10) {
      line += 1;
      lineStart = index + 1;
    }
  }

  return {
    line,
    character: clampedOffset - lineStart,
  };
}

function offsetFromPosition(text: string, position: LspPosition): number {
  if (position.line <= 0) {
    return Math.max(0, Math.min(position.character, text.length));
  }

  let currentLine = 0;
  let lineStart = 0;

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) {
      currentLine += 1;
      lineStart = index + 1;
      if (currentLine === position.line) {
        break;
      }
    }
  }

  if (currentLine < position.line) {
    lineStart = text.length;
  }

  let lineEnd = text.indexOf('\n', lineStart);
  if (lineEnd === -1) {
    lineEnd = text.length;
  }

  return Math.max(lineStart, Math.min(lineStart + position.character, lineEnd));
}

function normalizeStatusKind(value: unknown): AutocompleteStatusKind {
  if (value === 'Normal' || value === 'Warning' || value === 'Error' || value === 'Inactive') {
    return value;
  }

  return 'Warning';
}

export class CopilotAutocompleteSession extends EventEmitter {
  readonly sessionId: string;
  readonly cwd: string;

  private readonly rpcProcess: JsonRpcProcess;
  private readonly document: DocumentState;
  private readonly readyPromise: Promise<void>;
  private readonly githubToken?: string;
  private readonly githubUser?: string;
  private readonly selectedCompletionModel?: string;
  private readonly fetchGitHubUser: (githubToken: string) => Promise<string>;
  private readonly suggestions = new Map<string, StoredSuggestion>();
  private activeCompletionRequestId: JsonRpcId | null = null;
  private initializationError: Error | null = null;
  private closed = false;
  private shuttingDown = false;

  constructor(options: CopilotAutocompleteSessionOptions) {
    super();
    this.sessionId = options.sessionId;
    this.cwd = options.cwd;
    this.githubToken = options.githubToken?.trim() || undefined;
    this.githubUser = options.githubUser?.trim() || undefined;
    this.selectedCompletionModel = options.selectedCompletionModel?.trim() || undefined;
    this.fetchGitHubUser = options.fetchGitHubUser ?? fetchGitHubUser;
    this.document = {
      uri: pathToFileURL(path.join(options.cwd, '.copilot-wrapper-prompt.md')).toString(),
      text: '',
      version: 0,
      languageId: DEFAULT_LANGUAGE_ID,
      documentPath: null,
      opened: false,
    };

    this.rpcProcess = (options.createJsonRpcProcess ?? ((processOptions) => new JsonRpcProcess(processOptions)))({
      command: options.command,
      args: options.args,
      cwd: options.cwd,
      env: options.env,
    });

    this.rpcProcess.on('notification', (event: { method: string; params?: unknown }) => {
      this.handleNotification(event.method, event.params);
    });

    this.rpcProcess.on('request', (event: { id: JsonRpcId; method: string; params?: unknown }) => {
      this.handleRequest(event.id, event.method, event.params);
    });

    this.rpcProcess.on('stderr', (chunk: string) => {
      logger.debug({ sessionId: this.sessionId, stderr: chunk.trim() }, 'Copilot LSP stderr');
    });

    this.rpcProcess.on('protocolError', (error: Error) => {
      logger.error({ err: error, sessionId: this.sessionId }, 'Copilot LSP protocol error');
      this.emitStatus('Error', 'Falha ao interpretar respostas do Copilot autocomplete.');
    });

    this.rpcProcess.on('exit', (code: number | null, signal?: string) => {
      this.closed = true;
      if (!this.shuttingDown) {
        this.emitStatus('Warning', 'Autocomplete indisponivel porque o processo do Copilot foi encerrado.');
      }
      this.emit('exit', code, signal);
    });

    this.readyPromise = this.initialize().catch((error) => {
      this.initializationError = error as Error;
      if (!this.shuttingDown) {
        logger.error({ err: error, sessionId: this.sessionId }, 'Copilot autocomplete initialization failed');
        this.emitStatus('Error', (error as Error).message);
      }
    });
  }

  async requestCompletions(options: {
    text: string;
    cursor: number;
    documentPath?: string;
    languageId?: string;
    tabSize?: number;
    insertSpaces?: boolean;
    contextPrefix?: string;
  }): Promise<PromptAutocompleteSuggestion[]> {
    if (this.closed) {
      throw new Error('Autocomplete session is closed');
    }

    await this.readyPromise;
    if (this.initializationError) {
      throw this.initializationError;
    }

    if (this.closed) {
      throw new Error('Autocomplete session is closed');
    }

    const prefix = options.contextPrefix ?? '';
    const originalText = options.text;
    const composedText = `${prefix}${originalText}`;
    await this.syncDocument(
      composedText,
      options.languageId ?? DEFAULT_LANGUAGE_ID,
      options.documentPath?.trim() || null,
    );

    const originalCursor = Math.max(0, Math.min(options.cursor, originalText.length));
    const cursor = Math.max(0, Math.min(prefix.length + originalCursor, this.document.text.length));
    const position = positionFromOffset(this.document.text, cursor);

    if (this.activeCompletionRequestId !== null) {
      this.rpcProcess.cancel(this.activeCompletionRequestId);
    }

    const { id, promise } = this.rpcProcess.request('textDocument/inlineCompletion', {
      textDocument: {
        uri: this.document.uri,
        version: this.document.version,
      },
      position,
      context: {
        triggerKind: 2,
      },
      formattingOptions: {
        tabSize: options.tabSize ?? DEFAULT_TAB_SIZE,
        insertSpaces: options.insertSpaces ?? true,
      },
    });

    this.activeCompletionRequestId = id;

    let response: InlineCompletionResult | undefined;
    try {
      response = await promise as InlineCompletionResult | undefined;
    } catch (error) {
      const message = (error as Error).message;
      const cancelledByNewerRequest = this.activeCompletionRequestId !== null
        && this.activeCompletionRequestId !== id
        && /cancel/i.test(message);

      if (cancelledByNewerRequest) {
        return [];
      }

      throw error;
    } finally {
      if (this.activeCompletionRequestId === id) {
        this.activeCompletionRequestId = null;
      }
    }

    const items = Array.isArray(response?.items) ? response.items : [];
    this.suggestions.clear();

    const suggestions = items
      .filter((item): item is InlineCompletionItem => typeof item.insertText === 'string')
      .map((item) => {
        const range = item.range ?? { start: position, end: position };
        const rawReplaceStart = offsetFromPosition(this.document.text, range.start) - prefix.length;
        const rawReplaceEnd = offsetFromPosition(this.document.text, range.end) - prefix.length;
        const replaceStart = Math.max(0, Math.min(rawReplaceStart, originalText.length));
        const replaceEnd = Math.max(replaceStart, Math.min(rawReplaceEnd, originalText.length));
        const suggestionId = nanoid();
        this.suggestions.set(suggestionId, { item });
        return {
          id: suggestionId,
          insertText: item.insertText,
          replaceStart,
          replaceEnd,
        } satisfies PromptAutocompleteSuggestion;
      });

    if (items[0]) {
      this.rpcProcess.notify('textDocument/didShowCompletion', { item: items[0] });
    }

    return suggestions;
  }

  async acceptSuggestion(suggestionId: string): Promise<boolean> {
    if (this.closed) {
      return false;
    }

    await this.readyPromise;
    if (this.initializationError || this.closed) {
      return false;
    }

    const suggestion = this.suggestions.get(suggestionId);
    if (!suggestion) {
      return false;
    }

    if (suggestion.item.command) {
      const { promise } = this.rpcProcess.request('workspace/executeCommand', suggestion.item.command);
      await promise;
    }

    this.suggestions.clear();
    return true;
  }

  close(): void {
    if (this.closed) {
      return;
    }

    this.shuttingDown = true;
    this.closed = true;
    this.suggestions.clear();

    if (this.document.opened) {
      this.rpcProcess.notify('textDocument/didClose', {
        textDocument: {
          uri: this.document.uri,
        },
      });
    }

    this.rpcProcess.kill();
  }

  private async initialize(): Promise<void> {
    const { promise } = this.rpcProcess.request('initialize', {
      processId: process.pid,
      workspaceFolders: [
        {
          uri: pathToFileURL(this.cwd).toString(),
          name: this.cwd,
        },
      ],
      capabilities: {
        workspace: {
          workspaceFolders: true,
        },
        window: {
          showDocument: {
            support: true,
          },
        },
      },
      initializationOptions: {
        editorInfo: {
          name: 'copilot-api-wrapper',
          version: WRAPPER_VERSION,
        },
        editorPluginInfo: {
          name: 'copilot-api-wrapper',
          version: WRAPPER_VERSION,
        },
      },
    });

    const initializeResult = await promise as { capabilities?: { textDocumentSync?: { change?: number } } } | undefined;
    if (this.closed) {
      return;
    }

    const changeMode = initializeResult?.capabilities?.textDocumentSync?.change;
    if (changeMode !== undefined && changeMode !== TEXT_DOCUMENT_SYNC_INCREMENTAL) {
      logger.warn(
        { sessionId: this.sessionId, changeMode },
        'Copilot LSP reported an unexpected textDocumentSync mode',
      );
    }

    this.rpcProcess.notify('initialized', {});

    await this.bootstrapAuthentication();

    const copilotSettings: Record<string, unknown> = {
      editor: {
        showEditorCompletions: true,
        enableAutoCompletions: true,
      },
    };

    if (this.selectedCompletionModel) {
      copilotSettings.selectedCompletionModel = this.selectedCompletionModel;
    }

    this.rpcProcess.notify('workspace/didChangeConfiguration', {
      settings: {
        telemetry: {
          telemetryLevel: 'all',
        },
        github: {
          copilot: copilotSettings,
        },
      },
    });
  }

  private async bootstrapAuthentication(): Promise<void> {
    if (!this.githubToken) {
      return;
    }

    const user = this.githubUser ?? await this.fetchGitHubUser(this.githubToken);
    const trimmedUser = user.trim();
    if (!trimmedUser) {
      throw new Error('Nao foi possivel determinar o usuario GitHub para autenticar o autocomplete.');
    }

    await this.rpcProcess.request('signInWithGithubToken', {
      githubToken: this.githubToken,
      user: trimmedUser,
    }).promise;

    const statusResponse = await this.rpcProcess.request('checkStatus', {
      options: {
        localChecksOnly: false,
        forceRefresh: true,
      },
    }).promise as { status?: unknown; user?: unknown } | undefined;

    const status = typeof statusResponse?.status === 'string' ? statusResponse.status : undefined;
    if (status && !VALID_AUTH_STATUSES.has(status)) {
      throw new Error(`O token configurado para o autocomplete foi rejeitado pelo Copilot (${status}).`);
    }
  }

  private async syncDocument(nextText: string, nextLanguageId: string, nextDocumentPath: string | null): Promise<void> {
    const normalizedLanguageId = nextLanguageId.trim() || DEFAULT_LANGUAGE_ID;
    const nextUri = pathToFileURL(nextDocumentPath ?? path.join(this.cwd, '.copilot-wrapper-prompt.md')).toString();

    if (!this.document.opened) {
      this.document.uri = nextUri;
      this.document.text = nextText;
      this.document.version = 1;
      this.document.languageId = normalizedLanguageId;
      this.document.documentPath = nextDocumentPath;
      this.document.opened = true;

      this.rpcProcess.notify('textDocument/didOpen', {
        textDocument: {
          uri: this.document.uri,
          languageId: this.document.languageId,
          version: this.document.version,
          text: this.document.text,
        },
      });
      this.rpcProcess.notify('textDocument/didFocus', {
        textDocument: {
          uri: this.document.uri,
        },
      });
      return;
    }

    if (this.document.uri !== nextUri || this.document.languageId !== normalizedLanguageId) {
      this.rpcProcess.notify('textDocument/didClose', {
        textDocument: {
          uri: this.document.uri,
        },
      });

      this.document.uri = nextUri;
      this.document.text = nextText;
      this.document.version += 1;
      this.document.languageId = normalizedLanguageId;
      this.document.documentPath = nextDocumentPath;

      this.rpcProcess.notify('textDocument/didOpen', {
        textDocument: {
          uri: this.document.uri,
          languageId: this.document.languageId,
          version: this.document.version,
          text: this.document.text,
        },
      });
      this.rpcProcess.notify('textDocument/didFocus', {
        textDocument: {
          uri: this.document.uri,
        },
      });
      return;
    }

    if (this.document.text !== nextText) {
      const previousText = this.document.text;
      this.document.text = nextText;
      this.document.version += 1;

      this.rpcProcess.notify('textDocument/didChange', {
        textDocument: {
          uri: this.document.uri,
          version: this.document.version,
        },
        contentChanges: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: positionFromOffset(previousText, previousText.length),
            },
            rangeLength: previousText.length,
            text: nextText,
          },
        ],
      });
    }

    this.rpcProcess.notify('textDocument/didFocus', {
      textDocument: {
        uri: this.document.uri,
      },
    });
  }

  private handleNotification(method: string, params: unknown): void {
    switch (method) {
      case 'didChangeStatus': {
        const status = params as StatusParams;
        this.emitStatus(normalizeStatusKind(status.kind), status.message ?? '');
        break;
      }

      case 'window/logMessage':
        logger.debug({ sessionId: this.sessionId, params }, 'Copilot LSP log message');
        break;

      default:
        break;
    }
  }

  private handleRequest(id: JsonRpcId, method: string, params: unknown): void {
    switch (method) {
      case 'window/showDocument': {
        const doc = params as { uri?: string; external?: boolean };
        if (doc.uri) {
          logger.info({ sessionId: this.sessionId, uri: doc.uri }, 'Copilot LSP showDocument request');
          this.emitStatus('Warning', `Abra no navegador: ${doc.uri}`);
        }
        this.rpcProcess.respond(id, { success: true });
        return;
      }

      case 'window/showMessageRequest': {
        const request = params as WindowShowMessageRequestParams;
        const type = request.type ?? 3;
        const kind: AutocompleteStatusKind = type === 1 ? 'Error' : type === 2 ? 'Warning' : 'Normal';
        this.emitStatus(kind, request.message ?? '');
        this.rpcProcess.respond(id, null);
        return;
      }

      default:
        this.rpcProcess.respond(id, null);
        return;
    }
  }

  private emitStatus(kind: AutocompleteStatusKind, message: string): void {
    this.emit('status', {
      kind,
      message,
    });
  }
}
