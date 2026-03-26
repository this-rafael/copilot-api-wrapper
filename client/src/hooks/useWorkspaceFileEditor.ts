import { useCallback, useEffect, useRef, useState } from 'react';
import type { ServerMessage } from '../lib/protocol';
import type { SessionStatus } from './useSession';

type FileEditorStatus = 'idle' | 'loading' | 'ready' | 'saving' | 'error';

interface UseWorkspaceFileEditorOptions {
  sessionId: string | null;
  sessionStatus: SessionStatus;
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  addFileReadListener: (listener: (message: {
    path: string;
    content: string;
    versionToken: string;
  }) => void) => () => void;
  addFileWriteListener: (listener: (message: {
    path: string;
    versionToken: string;
  }) => void) => () => void;
  readFile: (path: string) => void;
  writeFile: (path: string, content: string, versionToken: string) => void;
}

export function useWorkspaceFileEditor(options: UseWorkspaceFileEditorOptions) {
  const {
    sessionId,
    sessionStatus,
    addMessageListener,
    addFileReadListener,
    addFileWriteListener,
    readFile,
    writeFile,
  } = options;

  const [status, setStatus] = useState<FileEditorStatus>('idle');
  const [requestedPath, setRequestedPath] = useState<string | null>(null);
  const [filePath, setFilePath] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [versionToken, setVersionToken] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const initialValueRef = useRef('');
  const pendingReadPathRef = useRef<string | null>(null);
  const activePathRef = useRef<string | null>(null);
  const valueRef = useRef('');

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  const close = useCallback(() => {
    pendingReadPathRef.current = null;
    activePathRef.current = null;
    initialValueRef.current = '';
    setRequestedPath(null);
    setFilePath(null);
    setValue('');
    setCursor(0);
    setVersionToken(null);
    setErrorMessage(null);
    setSaveMessage(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (sessionStatus === 'active') {
      return;
    }

    if (requestedPath || filePath) {
      close();
    }
  }, [close, filePath, requestedPath, sessionStatus]);

  useEffect(() => {
    return addFileReadListener((message) => {
      if (message.path !== pendingReadPathRef.current) {
        return;
      }

      pendingReadPathRef.current = null;
      activePathRef.current = message.path;
      initialValueRef.current = message.content;
      setRequestedPath(message.path);
      setFilePath(message.path);
      setValue(message.content);
      setCursor(0);
      setVersionToken(message.versionToken);
      setErrorMessage(null);
      setSaveMessage(null);
      setStatus('ready');
    });
  }, [addFileReadListener]);

  useEffect(() => {
    return addFileWriteListener((message) => {
      if (message.path !== activePathRef.current) {
        return;
      }

      initialValueRef.current = valueRef.current;
      setVersionToken(message.versionToken);
      setErrorMessage(null);
      setSaveMessage('Arquivo salvo');
      setStatus('ready');
    });
  }, [addFileWriteListener]);

  useEffect(() => {
    return addMessageListener((message) => {
      if (message.type !== 'session.error') {
        return;
      }

      if (message.sessionId && sessionId && message.sessionId !== sessionId) {
        return;
      }

      if (message.code === 'FILE_READ_FAILED' && pendingReadPathRef.current) {
        setErrorMessage(message.message);
        setStatus('error');
        return;
      }

      if (message.code === 'FILE_WRITE_FAILED' && activePathRef.current) {
        setErrorMessage(message.message);
        setStatus(filePath ? 'ready' : 'error');
      }
    });
  }, [addMessageListener, filePath, sessionId]);

  useEffect(() => {
    if (!saveMessage) {
      return;
    }

    const handle = window.setTimeout(() => setSaveMessage(null), 1800);
    return () => window.clearTimeout(handle);
  }, [saveMessage]);

  const openFile = useCallback((path: string) => {
    if (sessionStatus !== 'active') {
      return;
    }

    pendingReadPathRef.current = path;
    activePathRef.current = null;
    initialValueRef.current = '';
    setRequestedPath(path);
    setFilePath(null);
    setValue('');
    setCursor(0);
    setVersionToken(null);
    setErrorMessage(null);
    setSaveMessage(null);
    setStatus('loading');
    readFile(path);
  }, [readFile, sessionStatus]);

  const updateValue = useCallback((nextValue: string, nextCursor: number) => {
    setValue(nextValue);
    setCursor(nextCursor);
    setErrorMessage(null);
    setSaveMessage(null);
  }, []);

  const save = useCallback(() => {
    if (!filePath || !versionToken || status === 'saving') {
      return;
    }

    setStatus('saving');
    setErrorMessage(null);
    writeFile(filePath, valueRef.current, versionToken);
  }, [filePath, status, versionToken, writeFile]);

  return {
    isOpen: requestedPath !== null,
    status,
    path: filePath ?? requestedPath,
    value,
    cursor,
    versionToken,
    errorMessage,
    saveMessage,
    isDirty: filePath !== null && value !== initialValueRef.current,
    openFile,
    close,
    save,
    setValue: updateValue,
    setCursor,
  };
}