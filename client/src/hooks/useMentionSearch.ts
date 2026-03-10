import { useEffect, useMemo, useState } from 'react';
import { parseActiveMention, replaceActiveMention, type ActiveMention } from '../lib/mentions';
import type { ContextSearchItem, ContextSearchResultsMessage } from '../lib/protocol';

export type MentionSearchStatus = 'idle' | 'loading' | 'ready';

interface UseMentionSearchOptions {
  value: string;
  cursor: number;
  sessionStatus: 'idle' | 'creating' | 'active' | 'closed' | 'error' | 'disconnected';
  searchContext: (mentionType: 'file' | 'folder' | 'workspace', query: string, limit?: number) => void;
  addSearchResultsListener: (listener: (message: ContextSearchResultsMessage) => void) => () => void;
}

export function useMentionSearch(options: UseMentionSearchOptions) {
  const { value, cursor, sessionStatus, searchContext, addSearchResultsListener } = options;
  const [items, setItems] = useState<ContextSearchItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [status, setStatus] = useState<MentionSearchStatus>('idle');

  const activeMention = useMemo<ActiveMention | null>(() => {
    return parseActiveMention(value, cursor);
  }, [cursor, value]);

  const activeMentionKey = useMemo(() => {
    if (!activeMention) {
      return null;
    }

    return `${activeMention.mentionType}:${activeMention.tokenStart}:${activeMention.query}`;
  }, [activeMention]);

  const [dismissedMentionKey, setDismissedMentionKey] = useState<string | null>(null);

  useEffect(() => {
    if (!activeMentionKey) {
      if (dismissedMentionKey !== null) {
        setDismissedMentionKey(null);
      }
      setStatus('idle');
      setSearchQuery('');
      return;
    }

    if (dismissedMentionKey && dismissedMentionKey !== activeMentionKey) {
      setDismissedMentionKey(null);
    }
  }, [activeMentionKey, dismissedMentionKey]);

  useEffect(() => {
    setSearchQuery(activeMention?.query ?? '');
  }, [activeMentionKey, activeMention?.query]);

  useEffect(() => {
    return addSearchResultsListener((message) => {
      if (!activeMention || !activeMentionKey) {
        return;
      }

      if (message.mentionType !== activeMention.mentionType) {
        return;
      }

      if (message.query !== searchQuery) {
        return;
      }

      setStatus('ready');
      setItems(message.items);
      setIsOpen(dismissedMentionKey !== activeMentionKey);
    });
  }, [activeMention, activeMentionKey, addSearchResultsListener, dismissedMentionKey, searchQuery]);

  useEffect(() => {
    if (!activeMention || sessionStatus !== 'active') {
      setItems((current) => (current.length === 0 ? current : []));
      setStatus('idle');
      setIsOpen(false);
      return;
    }

    if (activeMention.mentionType === 'workspace') {
      setStatus('ready');
      setItems([
        {
          id: '.',
          kind: 'workspace',
          label: '@workspace',
          path: '.',
          description: 'Workspace remoto atual',
        },
      ]);
      setIsOpen(dismissedMentionKey !== activeMentionKey);
      return;
    }

    setStatus('loading');
    setIsOpen(dismissedMentionKey !== activeMentionKey);

    const handle = window.setTimeout(() => {
      searchContext(activeMention.mentionType, searchQuery, 20);
    }, 180);

    return () => {
      window.clearTimeout(handle);
    };
  }, [activeMention, activeMentionKey, dismissedMentionKey, searchContext, searchQuery, sessionStatus]);

  return {
    activeMention,
    items,
    isOpen,
    status,
    query: searchQuery,
    setQuery: (nextQuery: string) => {
      setDismissedMentionKey(null);
      setSearchQuery(nextQuery);
    },
    close: () => {
      if (activeMentionKey) {
        setDismissedMentionKey(activeMentionKey);
      }
      setIsOpen(false);
    },
    applyItem(item: ContextSearchItem): string | null {
      if (!activeMention) {
        return null;
      }
      setDismissedMentionKey(null);
      setIsOpen(false);
      return replaceActiveMention(value, activeMention, item);
    },
  };
}