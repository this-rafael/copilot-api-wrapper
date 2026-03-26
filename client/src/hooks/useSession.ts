import { useCallback, useEffect, useRef, useState } from 'react';
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
import { stripAnsiSequences } from '../lib/terminalOutput';

export type SessionStatus = 'idle' | 'creating' | 'active' | 'closed' | 'error' | 'disconnected';

export function isSessionReadyOutput(data: string): boolean {
  const normalized = stripAnsiSequences(data).replace(/\s+/g, ' ').trim();

  return normalized.includes('READY')
    || normalized.includes('Type @ to mention files')
    || /(?:^|\s)❯(?:\s|$)/.test(normalized);
}

type MessageSubscription = (listener: (message: ServerMessage) => void) => () => void;
type OutputListener = (chunk: string) => void;
type SearchListener = (message: ContextSearchResultsMessage) => void;
type FileReadListener = (message: FileReadResultsMessage) => void;
type FileWriteListener = (message: FileWriteResultsMessage) => void;
type AutocompleteResultsListener = (message: AutocompleteResultsMessage) => void;
type AutocompleteStatusListener = (message: AutocompleteStatusMessage) => void;

interface UseSessionOptions {
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

export function useSession(options: UseSessionOptions) {
  const { socketStatus, addMessageListener, sendMessage } = options;
  const sessionIdRef = useRef<string | null>(null);
  const statusRef = useRef<SessionStatus>('idle');
  const outputListenersRef = useRef(new Set<OutputListener>());
  const searchListenersRef = useRef(new Set<SearchListener>());
  const fileReadListenersRef = useRef(new Set<FileReadListener>());
  const fileWriteListenersRef = useRef(new Set<FileWriteListener>());
  const autocompleteResultsListenersRef = useRef(new Set<AutocompleteResultsListener>());
  const autocompleteStatusListenersRef = useRef(new Set<AutocompleteStatusListener>());

  const [status, setStatus] = useState<SessionStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return addMessageListener((message) => {
      switch (message.type) {
        case 'session.ready':
          sessionIdRef.current = message.sessionId;
          statusRef.current = 'creating';
          setSessionId(message.sessionId);
          setStatus('creating');
          setErrorMessage(null);
          setExitCode(null);
          break;

        case 'terminal.output':
          if (message.sessionId === sessionIdRef.current) {
            if (statusRef.current === 'creating' && isSessionReadyOutput(message.data)) {
              statusRef.current = 'active';
              setStatus('active');
            }
            outputListenersRef.current.forEach((listener) => listener(message.data));
          }
          break;

        case 'context.search.results':
          if (message.sessionId === sessionIdRef.current) {
            searchListenersRef.current.forEach((listener) => listener(message));
          }
          break;

        case 'file.read.results':
          if (message.sessionId === sessionIdRef.current) {
            fileReadListenersRef.current.forEach((listener) => listener(message));
          }
          break;

        case 'file.write.results':
          if (message.sessionId === sessionIdRef.current) {
            fileWriteListenersRef.current.forEach((listener) => listener(message));
          }
          break;

        case 'autocomplete.results':
          if (message.sessionId === sessionIdRef.current) {
            autocompleteResultsListenersRef.current.forEach((listener) => listener(message));
          }
          break;

        case 'autocomplete.status':
          if (message.sessionId === sessionIdRef.current) {
            autocompleteStatusListenersRef.current.forEach((listener) => listener(message));
          }
          break;

        case 'session.exit':
          if (message.sessionId === sessionIdRef.current) {
            statusRef.current = 'closed';
            setStatus('closed');
            setExitCode(message.exitCode);
            sessionIdRef.current = null;
            setSessionId(null);
          }
          break;

        case 'session.error':
          setErrorMessage(message.message);
          if (!message.sessionId || message.sessionId === sessionIdRef.current) {
            setStatus((current) => {
              statusRef.current = current === 'disconnected' ? 'disconnected' : 'error';
              return statusRef.current;
            });
          }
          break;
      }
    });
  }, [addMessageListener]);

  useEffect(() => {
    if (socketStatus === 'reconnecting' && (status === 'active' || status === 'creating')) {
      sessionIdRef.current = null;
      statusRef.current = 'disconnected';
      setSessionId(null);
      setStatus('disconnected');
      setErrorMessage('Conexao perdida. Crie uma nova sessao apos a reconexao.');
    }
  }, [socketStatus, status]);

  const createSession = useCallback(({ cwd, cols, rows, commandProfile }: CreateSessionOptions) => {
    statusRef.current = 'creating';
    setStatus('creating');
    setErrorMessage(null);
    setExitCode(null);
    sendMessage({ type: 'session.create', cwd, cols, rows, commandProfile });
  }, [sendMessage]);

  const sendInput = useCallback((data: string) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({ type: 'terminal.input', sessionId: sessionIdRef.current, data });
  }, [sendMessage]);

  const resize = useCallback((cols: number, rows: number) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({ type: 'terminal.resize', sessionId: sessionIdRef.current, cols, rows });
  }, [sendMessage]);

  const closeSession = useCallback(() => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({ type: 'session.close', sessionId: sessionIdRef.current });
  }, [sendMessage]);

  const searchContext = useCallback((mentionType: 'file' | 'folder' | 'workspace', query: string, limit = 20) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({
      type: 'context.search',
      sessionId: sessionIdRef.current,
      mentionType,
      query,
      limit,
    });
  }, [sendMessage]);

  const addOutputListener = useCallback((listener: OutputListener) => {
    outputListenersRef.current.add(listener);
    return () => {
      outputListenersRef.current.delete(listener);
    };
  }, []);

  const addSearchResultsListener = useCallback((listener: SearchListener) => {
    searchListenersRef.current.add(listener);
    return () => {
      searchListenersRef.current.delete(listener);
    };
  }, []);

  const readFile = useCallback((path: string) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({
      type: 'file.read',
      sessionId: sessionIdRef.current,
      path,
    });
  }, [sendMessage]);

  const writeFile = useCallback((path: string, content: string, versionToken: string) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({
      type: 'file.write',
      sessionId: sessionIdRef.current,
      path,
      content,
      versionToken,
    });
  }, [sendMessage]);

  const addFileReadListener = useCallback((listener: FileReadListener) => {
    fileReadListenersRef.current.add(listener);
    return () => {
      fileReadListenersRef.current.delete(listener);
    };
  }, []);

  const addFileWriteListener = useCallback((listener: FileWriteListener) => {
    fileWriteListenersRef.current.add(listener);
    return () => {
      fileWriteListenersRef.current.delete(listener);
    };
  }, []);

  const requestAutocomplete = useCallback((
    requestId: number,
    text: string,
    cursor: number,
    languageId = 'markdown',
    tabSize = 2,
    insertSpaces = true,
    documentPath?: string,
  ) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({
      type: 'autocomplete.request',
      sessionId: sessionIdRef.current,
      requestId,
      text,
      cursor,
      documentPath,
      languageId,
      tabSize,
      insertSpaces,
    });
  }, [sendMessage]);

  const acceptAutocomplete = useCallback((suggestionId: string) => {
    if (!sessionIdRef.current) {
      return;
    }

    sendMessage({
      type: 'autocomplete.accept',
      sessionId: sessionIdRef.current,
      suggestionId,
    });
  }, [sendMessage]);

  const addAutocompleteResultsListener = useCallback((listener: AutocompleteResultsListener) => {
    autocompleteResultsListenersRef.current.add(listener);
    return () => {
      autocompleteResultsListenersRef.current.delete(listener);
    };
  }, []);

  const addAutocompleteStatusListener = useCallback((listener: AutocompleteStatusListener) => {
    autocompleteStatusListenersRef.current.add(listener);
    return () => {
      autocompleteStatusListenersRef.current.delete(listener);
    };
  }, []);

  const resetSession = useCallback(() => {
    sessionIdRef.current = null;
    statusRef.current = 'idle';
    setSessionId(null);
    setStatus('idle');
    setErrorMessage(null);
    setExitCode(null);
  }, []);

  return {
    status,
    sessionId,
    exitCode,
    errorMessage,
    createSession,
    sendInput,
    resize,
    closeSession,
    searchContext,
    readFile,
    writeFile,
    addOutputListener,
    addSearchResultsListener,
    addFileReadListener,
    addFileWriteListener,
    requestAutocomplete,
    acceptAutocomplete,
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
    resetSession,
  };
}
