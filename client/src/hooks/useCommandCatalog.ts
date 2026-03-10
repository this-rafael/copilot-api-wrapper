import { useDeferredValue, useMemo } from 'react';
import { commandCatalog, searchCommandCatalog } from '../lib/commandCatalog';

export function useCommandCatalog(query: string) {
  const deferredQuery = useDeferredValue(query);

  return useMemo(() => {
    const items = searchCommandCatalog(commandCatalog, deferredQuery);

    return {
      items,
      groups: {
        slash: items.filter((item) => item.group === 'slash'),
        mention: items.filter((item) => item.group === 'mention'),
        session: items.filter((item) => item.group === 'session'),
      },
    };
  }, [deferredQuery]);
}