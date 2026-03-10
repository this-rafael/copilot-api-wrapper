import { useCallback, useEffect, useRef, useState } from 'react';
import { isServerMessage, type ClientMessage, type ServerMessage } from '../lib/protocol';

type SocketStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

type MessageListener = (message: ServerMessage) => void;

interface ConnectionConfig {
  url: string;
  token: string;
}

function normalizeWebSocketUrl(url: string, token: string): string {
  const trimmed = url.trim();
  const normalized = trimmed.startsWith('http://')
    ? trimmed.replace('http://', 'ws://')
    : trimmed.startsWith('https://')
      ? trimmed.replace('https://', 'wss://')
      : trimmed;

  const finalUrl = new URL(normalized);
  finalUrl.searchParams.set('token', token);
  return finalUrl.toString();
}

export function useWebSocket() {
  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const attemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const connectionRef = useRef<ConnectionConfig | null>(null);
  const pendingMessagesRef = useRef<string[]>([]);
  const listenersRef = useRef(new Set<MessageListener>());

  const [status, setStatus] = useState<SocketStatus>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const flushQueue = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    while (pendingMessagesRef.current.length > 0) {
      const message = pendingMessagesRef.current.shift();
      if (message) {
        socket.send(message);
      }
    }
  }, []);

  const addMessageListener = useCallback((listener: MessageListener) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const connect = useCallback((url: string, token: string) => {
    if (!url.trim() || !token.trim()) {
      setStatus('error');
      setErrorMessage('Informe a URL e o token para conectar.');
      return;
    }

    shouldReconnectRef.current = true;
    connectionRef.current = { url, token };
    setStatus(socketRef.current ? 'reconnecting' : 'connecting');
    setErrorMessage(null);

    const socket = new WebSocket(normalizeWebSocketUrl(url, token));
    socketRef.current = socket;

    socket.addEventListener('open', () => {
      attemptsRef.current = 0;
      setStatus('open');
      setErrorMessage(null);
      flushQueue();
    });

    socket.addEventListener('message', (event) => {
      try {
        const parsed = JSON.parse(String(event.data));
        if (!isServerMessage(parsed)) {
          return;
        }

        listenersRef.current.forEach((listener) => listener(parsed));
      } catch {
        setErrorMessage('Mensagem invalida recebida do servidor.');
      }
    });

    socket.addEventListener('error', () => {
      setStatus('error');
      setErrorMessage('Falha ao comunicar com o servidor WebSocket.');
    });

    socket.addEventListener('close', () => {
      socketRef.current = null;
      if (!shouldReconnectRef.current) {
        setStatus('closed');
        return;
      }

      attemptsRef.current += 1;
      setStatus('reconnecting');
      const delay = Math.min(1000 * 2 ** (attemptsRef.current - 1), 30_000);
      reconnectTimerRef.current = window.setTimeout(() => {
        if (connectionRef.current) {
          connect(connectionRef.current.url, connectionRef.current.token);
        }
      }, delay);
    });
  }, [flushQueue]);

  const disconnect = useCallback(() => {
    shouldReconnectRef.current = false;
    if (reconnectTimerRef.current !== null) {
      window.clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    socketRef.current?.close();
    socketRef.current = null;
    setStatus('closed');
  }, []);

  const sendMessage = useCallback((message: ClientMessage) => {
    const serialized = JSON.stringify(message);
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      pendingMessagesRef.current.push(serialized);
      return;
    }

    socket.send(serialized);
  }, []);

  useEffect(() => {
    return () => {
      shouldReconnectRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      socketRef.current?.close();
    };
  }, []);

  return {
    status,
    errorMessage,
    connect,
    disconnect,
    sendMessage,
    addMessageListener,
  };
}