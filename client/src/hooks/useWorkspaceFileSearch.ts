import { useCallback, useEffect, useRef, useState } from 'react';
import type { ContextSearchItem } from '../lib/protocol';
import type { SessionStatus } from './useSession';

type FileSearchStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseWorkspaceFileSearchOptions {
  sessionStatus: SessionStatus;
  searchContext: (mentionType: 'file' | 'folder' | 'workspace', query: string, limit?: number) => void;
  addSearchResultsListener: (listener: (message: {
    mentionType: 'file' | 'folder' | 'workspace';
    query: string;
    items: ContextSearchItem[];
  }) => void) => () => void;
}

const SEARCH_DEBOUNCE_MS = 120;
const SEARCH_LIMIT = 40;

export function useWorkspaceFileSearch(options: UseWorkspaceFileSearchOptions) {
  const { sessionStatus, searchContext, addSearchResultsListener } = options;
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ContextSearchItem[]>([]);
  const [status, setStatus] = useState<FileSearchStatus>('idle');
  const latestQueryRef = useRef('');

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery('');
    setItems([]);
    setStatus('idle');
    latestQueryRef.current = '';
  }, []);

  const open = useCallback(() => {
    setIsOpen(true);
    setQuery('');
    setItems([]);
    setStatus('loading');
    latestQueryRef.current = '';
  }, []);

  useEffect(() => {
    return addSearchResultsListener((message) => {
      if (!isOpen || message.mentionType !== 'file') {
        return;
      }

      if (message.query !== latestQueryRef.current) {
        return;
      }

      setItems(message.items);
      setStatus('ready');
    });
  }, [addSearchResultsListener, isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    if (sessionStatus !== 'active') {
      close();
      return;
    }

    latestQueryRef.current = query;
    setStatus('loading');

    const handle = window.setTimeout(() => {
      searchContext('file', query, SEARCH_LIMIT);
    }, SEARCH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [close, isOpen, query, searchContext, sessionStatus]);

  return {
    isOpen,
    query,
    items,
    status,
    open,
    close,
    setQuery,
  };
}