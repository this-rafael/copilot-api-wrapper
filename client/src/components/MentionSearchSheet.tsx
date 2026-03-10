import type { ContextSearchItem } from '../lib/protocol';
import type { MentionSearchStatus } from '../hooks/useMentionSearch';

interface MentionSearchSheetProps {
  open: boolean;
  items: ContextSearchItem[];
  status: MentionSearchStatus;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (item: ContextSearchItem) => void;
  onClose: () => void;
}

export function MentionSearchSheet({ open, items, status, query, onQueryChange, onSelect, onClose }: MentionSearchSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--mention" onClick={onClose}>
      <section className="mention-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h3>Resultados</h3>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <input
          type="search"
          className="sheet-search"
          value={query}
          placeholder="Buscar no workspace..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => onQueryChange(event.target.value)}
        />
        {status === 'loading' ? <p className="empty-hint">Buscando no workspace...</p> : null}
        {status === 'ready' && items.length === 0 ? <p className="empty-hint">Nenhum resultado encontrado.</p> : null}
        {items.map((item) => (
          <button key={item.id} type="button" className="mention-item" onClick={() => onSelect(item)}>
            <strong>{item.label}</strong>
            <span>{item.description}</span>
          </button>
        ))}
      </section>
    </div>
  );
}