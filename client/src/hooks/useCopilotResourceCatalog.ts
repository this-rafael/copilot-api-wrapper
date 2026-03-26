import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClientMessage, CopilotResourceItem, ServerMessage } from '../lib/protocol';

type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
type MessageSubscription = (listener: (message: ServerMessage) => void) => () => void;
type CopilotResourceCatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseCopilotResourceCatalogOptions {
  socketStatus: SocketStatus;
  addMessageListener: MessageSubscription;
  sendMessage: (message: ClientMessage) => void;
}

export function useCopilotResourceCatalog(options: UseCopilotResourceCatalogOptions) {
  const { socketStatus, addMessageListener, sendMessage } = options;
  const statusRef = useRef<CopilotResourceCatalogStatus>('idle');

  const [status, setStatus] = useState<CopilotResourceCatalogStatus>('idle');
  const [items, setItems] = useState<CopilotResourceItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    return addMessageListener((message) => {
      switch (message.type) {
        case 'copilot.resources.list.results':
          statusRef.current = 'ready';
          setItems(message.items);
          setErrorMessage(null);
          setStatus('ready');
          break;

        case 'session.error':
          if (statusRef.current === 'loading' && !message.sessionId && message.code.startsWith('COPILOT_RESOURCES')) {
            statusRef.current = 'error';
            setErrorMessage(message.message);
            setStatus('error');
          }
          break;
      }
    });
  }, [addMessageListener]);

  useEffect(() => {
    if (socketStatus === 'closed' || socketStatus === 'idle') {
      statusRef.current = 'idle';
      setStatus('idle');
      setErrorMessage(null);
      setItems([]);
    }
  }, [socketStatus]);

  const requestResources = useCallback(() => {
    statusRef.current = 'loading';
    setStatus('loading');
    setErrorMessage(null);
    sendMessage({ type: 'copilot.resources.list' });
  }, [sendMessage]);

  const reset = useCallback(() => {
    statusRef.current = 'idle';
    setStatus('idle');
    setItems([]);
    setErrorMessage(null);
  }, []);

  const groups = useMemo(() => ({
    skills: items.filter((item) => item.kind === 'skill'),
    prompts: items.filter((item) => item.kind === 'prompt'),
    mcp: items.filter((item) => item.kind === 'mcp'),
  }), [items]);

  return {
    status,
    items,
    groups,
    errorMessage,
    requestResources,
    reset,
  };
}