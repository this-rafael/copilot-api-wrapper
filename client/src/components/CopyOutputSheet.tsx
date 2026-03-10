import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { copyTextToClipboard } from '../lib/clipboard';
import type { OutputHistoryItem } from '../lib/terminalOutput';

interface CopyOutputSheetProps {
  open: boolean;
  items: OutputHistoryItem[];
  onClose: () => void;
  onCopySuccess: (item: OutputHistoryItem) => void;
  onCopyError: (message: string) => void;
}

export function CopyOutputSheet({
  open,
  items,
  onClose,
  onCopySuccess,
  onCopyError,
}: CopyOutputSheetProps) {
  const [query, setQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const deferredQuery = useDeferredValue(query);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }

    const handle = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(handle);
  }, [open]);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    const orderedItems = [...items].sort((left, right) => right.order - left.order);

    if (!normalizedQuery) {
      return orderedItems;
    }

    return orderedItems.filter((item) => item.displayText.toLowerCase().includes(normalizedQuery));
  }, [deferredQuery, items]);

  if (!open) {
    return null;
  }

  async function handleCopy(item: OutputHistoryItem) {
    try {
      await copyTextToClipboard(item.displayText);
      onCopySuccess(item);
      onClose();
    } catch {
      onCopyError('Nao foi possivel copiar agora.');
    }
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="copy-output-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="copy-output-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h2 id="copy-output-title">Copiar output</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <input
          ref={searchInputRef}
          type="search"
          className="sheet-search"
          aria-label="Buscar linhas do output"
          value={query}
          placeholder="Buscar no output..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        {items.length === 0 ? <p className="empty-hint">Nenhuma linha disponivel para copiar.</p> : null}
        {items.length > 0 && filteredItems.length === 0 ? (
          <p className="empty-hint">Nenhuma linha contem esse termo.</p>
        ) : null}
        <div className="copy-output-list" role="list">
          {filteredItems.map((item) => (
            <div key={item.id} role="listitem">
              <button
                type="button"
                className="copy-output-item"
                aria-label={item.displayText || 'Copiar linha vazia'}
                onClick={() => void handleCopy(item)}
              >
                <strong>{item.displayText || '(linha vazia)'}</strong>
                <span>{item.source === 'terminal' ? 'Terminal' : item.source}</span>
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}