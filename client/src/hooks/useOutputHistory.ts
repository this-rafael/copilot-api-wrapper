import { useCallback, useEffect, useState } from 'react';
import type { OutputHistoryItem } from '../lib/terminalOutput';

interface UseOutputHistoryOptions {
  resetSignal: unknown;
}

export function useOutputHistory({
  resetSignal,
}: UseOutputHistoryOptions) {
  const [items, setItems] = useState<OutputHistoryItem[]>([]);

  useEffect(() => {
    setItems([]);
  }, [resetSignal]);

  const replaceItems = useCallback((nextItems: OutputHistoryItem[]) => {
    setItems(nextItems);
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  return {
    items,
    hasContent: items.length > 0,
    replaceItems,
    clear,
  };
}