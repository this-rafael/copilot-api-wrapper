import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClientMessage, ServerMessage, WorkspaceInfo } from '../lib/protocol';

type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
type MessageSubscription = (listener: (message: ServerMessage) => void) => () => void;
type WorkspaceCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseWorkspaceCatalogOptions {
  socketStatus: SocketStatus;
  addMessageListener: MessageSubscription;
  sendMessage: (message: ClientMessage) => void;
}

export function useWorkspaceCatalog(options: UseWorkspaceCatalogOptions) {
  const { socketStatus, addMessageListener, sendMessage } = options;
  const statusRef = useRef<WorkspaceCatalogStatus>('idle');

  const [status, setStatus] = useState<WorkspaceCatalogStatus>('idle');
  const [workspaces, setWorkspaces] = useState<WorkspaceInfo[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return addMessageListener((message) => {
      switch (message.type) {
        case 'workspace.list.results':
          setWorkspaces(message.workspaces);
          setErrorMessage(null);
          setStatus('ready');
          break;

        case 'session.error':
          if (statusRef.current === 'loading' && !message.sessionId) {
            setErrorMessage(message.message);
            setStatus('error');
          }
          break;
      }
    });
  }, [addMessageListener]);

  useEffect(() => {
    if (socketStatus === 'closed' || socketStatus === 'idle') {
      setStatus('idle');
    }
  }, [socketStatus]);

  const requestWorkspaces = useCallback(() => {
    setStatus('loading');
    setErrorMessage(null);
    sendMessage({ type: 'workspace.list' });
  }, [sendMessage]);

  const addCustomWorkspace = useCallback((path: string) => {
    setStatus('loading');
    setErrorMessage(null);
    sendMessage({ type: 'workspace.addCustom', path });
  }, [sendMessage]);

  const reset = useCallback(() => {
    setStatus('idle');
    setWorkspaces([]);
    setErrorMessage(null);
  }, []);

  return {
    status,
    workspaces,
    errorMessage,
    requestWorkspaces,
    addCustomWorkspace,
    reset,
  };
}