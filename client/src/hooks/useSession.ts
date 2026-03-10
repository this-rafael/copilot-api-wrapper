import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ClientMessage,
  CommandProfile,
  ContextSearchResultsMessage,
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
    addOutputListener,
    addSearchResultsListener,
    resetSession,
  };
}