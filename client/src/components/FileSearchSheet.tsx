import type { ContextSearchItem } from '../lib/protocol';

interface FileSearchSheetProps {
  open: boolean;
  query: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  items: ContextSearchItem[];
  onQueryChange: (value: string) => void;
  onSelect: (item: ContextSearchItem) => void;
  onClose: () => void;
}

export function FileSearchSheet({
  open,
  query,
  status,
  items,
  onQueryChange,
  onSelect,
  onClose,
}: FileSearchSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop sheet-backdrop--files" onClick={onClose}>
      <section className="mention-sheet file-search-sheet" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <div className="file-search-sheet__heading">
            <h3>Arquivos</h3>
            <p>Busca fuzzy no workspace remoto, otimizada para toque.</p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <input
          type="search"
          className="sheet-search"
          value={query}
          placeholder="Digite para buscar como no fzf..."
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint="search"
          onChange={(event) => onQueryChange(event.target.value)}
        />

        {status === 'loading' ? <p className="empty-hint">Procurando arquivos no workspace...</p> : null}
        {status === 'ready' && items.length === 0 ? <p className="empty-hint">Nenhum arquivo encontrado.</p> : null}

        <div className="file-search-sheet__list">
          {items.map((item) => (
            <button key={item.id} type="button" className="mention-item file-search-item" onClick={() => onSelect(item)}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.path}</span>
              </div>
              <small>abrir</small>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}