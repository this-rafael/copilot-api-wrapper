import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AutocompleteResultsMessage,
  AutocompleteStatusMessage,
  ClientMessage,
  CommandProfile,
  ContextSearchResultsMessage,
  FileReadResultsMessage,
  FileWriteResultsMessage,
  ServerMessage,
} from '../lib/protocol';
import { isSessionReadyOutput, type SessionStatus } from './useSession';

type MessageSubscription = (listener: (message: ServerMessage) => void) => () => void;
type OutputListener = (chunk: string) => void;
type SearchListener = (message: ContextSearchResultsMessage) => void;
type FileReadListener = (message: FileReadResultsMessage) => void;
type FileWriteListener = (message: FileWriteResultsMessage) => void;
type AutocompleteResultsListener = (message: AutocompleteResultsMessage) => void;
type AutocompleteStatusListener = (message: AutocompleteStatusMessage) => void;

interface UseSessionManagerOptions {
  socketStatus: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  addMessageListener: MessageSubscription;
  sendMessage: (message: ClientMessage) => void;
}

interface CreateSessionOptions {
  cwd: string;
  cols?: number;
  rows?: number;
  commandProfile: CommandProfile;
}

interface SessionRuntime {
  tabId: string;
  sessionId: string | null;
  status: SessionStatus;
  errorMessage: string | null;
  exitCode: number | null;
  output: string;
}

interface ListenerBucket {
  output: Set<OutputListener>;
  search: Set<SearchListener>;
  fileRead: Set<FileReadListener>;
  fileWrite: Set<FileWriteListener>;
  autocompleteResults: Set<AutocompleteResultsListener>;
  autocompleteStatus: Set<AutocompleteStatusListener>;
}

const DEFAULT_RUNTIME: Omit<SessionRuntime, 'tabId'> = {
  sessionId: null,
  status: 'idle',
  errorMessage: null,
  exitCode: null,
  output: '',
};

function createListenerBucket(): ListenerBucket {
  return {
    output: new Set<OutputListener>(),
    search: new Set<SearchListener>(),
    fileRead: new Set<FileReadListener>(),
    fileWrite: new Set<FileWriteListener>(),
    autocompleteResults: new Set<AutocompleteResultsListener>(),
    autocompleteStatus: new Set<AutocompleteStatusListener>(),
  };
}

export function useSessionManager(options: UseSessionManagerOptions) {
  const { socketStatus, addMessageListener, sendMessage } = options;
  const sessionsRef = useRef(new Map<string, SessionRuntime>());
  const tabIdBySessionIdRef = useRef(new Map<string, string>());
  const pendingReadyQueueRef = useRef<string[]>([]);
  const listenersRef = useRef(new Map<string, ListenerBucket>());
  const [sessions, setSessions] = useState<SessionRuntime[]>([]);

  const syncSessions = useCallback(() => {
    setSessions(Array.from(sessionsRef.current.values()));
  }, []);

  const ensureListeners = useCallback((tabId: string) => {
    let bucket = listenersRef.current.get(tabId);
    if (!bucket) {
      bucket = createListenerBucket();
      listenersRef.current.set(tabId, bucket);
    }

    return bucket;
  }, []);

  const ensureRuntime = useCallback((tabId: string) => {
    let runtime = sessionsRef.current.get(tabId);
    if (!runtime) {
      runtime = {
        tabId,
        ...DEFAULT_RUNTIME,
      };
      sessionsRef.current.set(tabId, runtime);
    }

    ensureListeners(tabId);
    return runtime;
  }, [ensureListeners]);

  const updateRuntime = useCallback((tabId: string, updater: (current: SessionRuntime) => SessionRuntime) => {
    const next = updater(ensureRuntime(tabId));
    sessionsRef.current.set(tabId, next);

    if (next.sessionId) {
      tabIdBySessionIdRef.current.set(next.sessionId, tabId);
    }

    syncSessions();
    return next;
  }, [ensureRuntime, syncSessions]);

  const getTabIdBySessionId = useCallback((sessionId?: string | null) => {
    if (!sessionId) {
      return null;
    }

    return tabIdBySessionIdRef.current.get(sessionId) ?? null;
  }, []);

  useEffect(() => {
    return addMessageListener((message) => {
      switch (message.type) {
        case 'session.ready': {
          const pendingTabId = pendingReadyQueueRef.current.shift();
          if (!pendingTabId) {
            return;
          }

          updateRuntime(pendingTabId, (current) => ({
            ...current,
            sessionId: message.sessionId,
            status: 'creating',
            errorMessage: null,
            exitCode: null,
          }));
          return;
        }

        case 'terminal.output': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          const bucket = ensureListeners(tabId);
          const nextRuntime = updateRuntime(tabId, (current) => ({
            ...current,
            status: current.status === 'creating' && isSessionReadyOutput(message.data) ? 'active' : current.status,
            output: `${current.output}${message.data}`,
          }));

          if (nextRuntime.status === 'active' && nextRuntime.errorMessage) {
            updateRuntime(tabId, (current) => ({
              ...current,
              errorMessage: null,
            }));
          }

          bucket.output.forEach((listener) => listener(message.data));
          return;
        }

        case 'context.search.results': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          ensureListeners(tabId).search.forEach((listener) => listener(message));
          return;
        }

        case 'file.read.results': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          ensureListeners(tabId).fileRead.forEach((listener) => listener(message));
          return;
        }

        case 'file.write.results': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          ensureListeners(tabId).fileWrite.forEach((listener) => listener(message));
          return;
        }

        case 'autocomplete.results': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          ensureListeners(tabId).autocompleteResults.forEach((listener) => listener(message));
          return;
        }

        case 'autocomplete.status': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          ensureListeners(tabId).autocompleteStatus.forEach((listener) => listener(message));
          return;
        }

        case 'session.exit': {
          const tabId = getTabIdBySessionId(message.sessionId);
          if (!tabId) {
            return;
          }

          tabIdBySessionIdRef.current.delete(message.sessionId);
          updateRuntime(tabId, (current) => ({
            ...current,
            status: 'closed',
            exitCode: message.exitCode,
            sessionId: null,
          }));
          return;
        }

        case 'session.error': {
          const tabId = message.sessionId
            ? getTabIdBySessionId(message.sessionId)
            : pendingReadyQueueRef.current.shift() ?? null;

          if (!tabId) {
            return;
          }

          updateRuntime(tabId, (current) => ({
            ...current,
            status: current.status === 'disconnected' ? 'disconnected' : 'error',
            errorMessage: message.message,
          }));
          return;
        }
      }
    });
  }, [addMessageListener, ensureListeners, getTabIdBySessionId, updateRuntime]);

  useEffect(() => {
    if (socketStatus !== 'reconnecting') {
      return;
    }

    let changed = false;
    const nextSessions = new Map<string, SessionRuntime>();
    const nextSessionIds = new Map<string, string>();

    sessionsRef.current.forEach((runtime, tabId) => {
      if (runtime.status === 'active' || runtime.status === 'creating') {
        nextSessions.set(tabId, {
          ...runtime,
          status: 'disconnected',
          sessionId: null,
          errorMessage: 'Conexao perdida. Crie uma nova sessao apos a reconexao.',
        });
        changed = true;
        return;
      }

      nextSessions.set(tabId, runtime);
      if (runtime.sessionId) {
        nextSessionIds.set(runtime.sessionId, tabId);
      }
    });

    if (!changed) {
      return;
    }

    sessionsRef.current = nextSessions;
    tabIdBySessionIdRef.current = nextSessionIds;
    pendingReadyQueueRef.current = [];
    syncSessions();
  }, [socketStatus, syncSessions]);

  const createSession = useCallback(({ tabId, cwd, cols, rows, commandProfile }: CreateSessionOptions & { tabId: string }) => {
    pendingReadyQueueRef.current = pendingReadyQueueRef.current.filter((pendingTabId) => pendingTabId !== tabId);
    pendingReadyQueueRef.current.push(tabId);

    updateRuntime(tabId, (current) => {
      if (current.sessionId) {
        tabIdBySessionIdRef.current.delete(current.sessionId);
      }

      return {
        ...current,
        sessionId: null,
        status: 'creating',
        errorMessage: null,
        exitCode: null,
        output: '',
      };
    });

    sendMessage({ type: 'session.create', cwd, cols, rows, commandProfile });
  }, [sendMessage, updateRuntime]);

  const withSessionId = useCallback((tabId: string, callback: (sessionId: string) => void) => {
    const runtime = ensureRuntime(tabId);
    if (!runtime.sessionId) {
      return;
    }

    callback(runtime.sessionId);
  }, [ensureRuntime]);

  const sendInput = useCallback((tabId: string, data: string) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({ type: 'terminal.input', sessionId, data });
    });
  }, [sendMessage, withSessionId]);

  const resize = useCallback((tabId: string, cols: number, rows: number) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({ type: 'terminal.resize', sessionId, cols, rows });
    });
  }, [sendMessage, withSessionId]);

  const closeSession = useCallback((tabId: string) => {
    const runtime = ensureRuntime(tabId);
    pendingReadyQueueRef.current = pendingReadyQueueRef.current.filter((pendingTabId) => pendingTabId !== tabId);

    if (runtime.sessionId) {
      sendMessage({ type: 'session.close', sessionId: runtime.sessionId });
      tabIdBySessionIdRef.current.delete(runtime.sessionId);
    }

    sessionsRef.current.delete(tabId);
    listenersRef.current.delete(tabId);
    syncSessions();
  }, [ensureRuntime, sendMessage, syncSessions]);

  const searchContext = useCallback((tabId: string, mentionType: 'file' | 'folder' | 'workspace', query: string, limit = 20) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({
        type: 'context.search',
        sessionId,
        mentionType,
        query,
        limit,
      });
    });
  }, [sendMessage, withSessionId]);

  const readFile = useCallback((tabId: string, path: string) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({
        type: 'file.read',
        sessionId,
        path,
      });
    });
  }, [sendMessage, withSessionId]);

  const writeFile = useCallback((tabId: string, path: string, content: string, versionToken: string) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({
        type: 'file.write',
        sessionId,
        path,
        content,
        versionToken,
      });
    });
  }, [sendMessage, withSessionId]);

  const requestAutocomplete = useCallback((
    tabId: string,
    requestId: number,
    text: string,
    cursor: number,
    languageId = 'markdown',
    tabSize = 2,
    insertSpaces = true,
    documentPath?: string,
  ) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({
        type: 'autocomplete.request',
        sessionId,
        requestId,
        text,
        cursor,
        documentPath,
        languageId,
        tabSize,
        insertSpaces,
      });
    });
  }, [sendMessage, withSessionId]);

  const acceptAutocomplete = useCallback((tabId: string, suggestionId: string) => {
    withSessionId(tabId, (sessionId) => {
      sendMessage({ type: 'autocomplete.accept', sessionId, suggestionId });
    });
  }, [sendMessage, withSessionId]);

  const addOutputListener = useCallback((tabId: string, listener: OutputListener) => {
    const bucket = ensureListeners(tabId);
    bucket.output.add(listener);
    return () => {
      bucket.output.delete(listener);
    };
  }, [ensureListeners]);

  const addSearchResultsListener = useCallback((tabId: string, listener: SearchListener) => {
    const bucket = ensureListeners(tabId);
    bucket.search.add(listener);
    return () => {
      bucket.search.delete(listener);
    };
  }, [ensureListeners]);

  const addFileReadListener = useCallback((tabId: string, listener: FileReadListener) => {
    const bucket = ensureListeners(tabId);
    bucket.fileRead.add(listener);
    return () => {
      bucket.fileRead.delete(listener);
    };
  }, [ensureListeners]);

  const addFileWriteListener = useCallback((tabId: string, listener: FileWriteListener) => {
    const bucket = ensureListeners(tabId);
    bucket.fileWrite.add(listener);
    return () => {
      bucket.fileWrite.delete(listener);
    };
  }, [ensureListeners]);

  const addAutocompleteResultsListener = useCallback((tabId: string, listener: AutocompleteResultsListener) => {
    const bucket = ensureListeners(tabId);
    bucket.autocompleteResults.add(listener);
    return () => {
      bucket.autocompleteResults.delete(listener);
    };
  }, [ensureListeners]);

  const addAutocompleteStatusListener = useCallback((tabId: string, listener: AutocompleteStatusListener) => {
    const bucket = ensureListeners(tabId);
    bucket.autocompleteStatus.add(listener);
    return () => {
      bucket.autocompleteStatus.delete(listener);
    };
  }, [ensureListeners]);

  const resetOutput = useCallback((tabId: string) => {
    updateRuntime(tabId, (current) => ({
      ...current,
      output: '',
    }));
  }, [updateRuntime]);

  return useMemo(() => ({
    sessions,
    createSession,
    sendInput,
    resize,
    closeSession,
    searchContext,
    readFile,
    writeFile,
    requestAutocomplete,
    acceptAutocomplete,
    addOutputListener,
    addSearchResultsListener,
    addFileReadListener,
    addFileWriteListener,
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
    resetOutput,
  }), [
    sessions,
    createSession,
    sendInput,
    resize,
    closeSession,
    searchContext,
    readFile,
    writeFile,
    requestAutocomplete,
    acceptAutocomplete,
    addOutputListener,
    addSearchResultsListener,
    addFileReadListener,
    addFileWriteListener,
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
    resetOutput,
  ]);
}