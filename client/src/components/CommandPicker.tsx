import { useState } from 'react';
import { useCommandCatalog } from '../hooks/useCommandCatalog';
import type { CommandCatalogItem } from '../lib/commandCatalog';

interface CommandPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: CommandCatalogItem) => void;
}

export function CommandPicker({ open, onClose, onSelect }: CommandPickerProps) {
  const [query, setQuery] = useState('');
  const { groups } = useCommandCatalog(query);

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h2>Commands</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <input
          className="sheet-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por comando, alias ou texto..."
        />
        <CommandGroup title="Slash commands" items={groups.slash} onSelect={onSelect} />
        <CommandGroup title="@ contextos" items={groups.mention} onSelect={onSelect} />
        <CommandGroup title="Controle de sessao" items={groups.session} onSelect={onSelect} />
      </section>
    </div>
  );
}

interface CommandGroupProps {
  title: string;
  items: CommandCatalogItem[];
  onSelect: (item: CommandCatalogItem) => void;
}

function CommandGroup({ title, items, onSelect }: CommandGroupProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="command-group">
      <h3>{title}</h3>
      {items.map((item) => (
        <button key={item.id} type="button" className="command-item" onClick={() => onSelect(item)}>
          <div>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
          </div>
          {item.warning ? <span className="warning-pill">Atencao</span> : null}
        </button>
      ))}
    </div>
  );
}