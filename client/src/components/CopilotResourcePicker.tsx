import { useDeferredValue, useMemo, useState } from 'react';
import type { CopilotResourceItem } from '../lib/protocol';

interface CopilotResourcePickerProps {
  open: boolean;
  items?: CopilotResourceItem[];
  errorMessage?: string | null;
  isLoading?: boolean;
  onClose: () => void;
  onReload: () => void;
  onSelect: (item: CopilotResourceItem) => void;
}

export function CopilotResourcePicker({
  open,
  items = [],
  errorMessage = null,
  isLoading = false,
  onClose,
  onReload,
  onSelect,
}: CopilotResourcePickerProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);

  const filteredItems = useMemo(() => {
    const normalizedQuery = deferredQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return items;
    }

    return items.filter((item) => {
      const haystacks = [item.label, item.description, item.originLabel, item.sourcePath, item.invocation];
      return haystacks.some((value) => value.toLowerCase().includes(normalizedQuery));
    });
  }, [deferredQuery, items]);

  const groups = useMemo(() => ({
    skills: filteredItems.filter((item) => item.kind === 'skill'),
    prompts: filteredItems.filter((item) => item.kind === 'prompt'),
    mcp: filteredItems.filter((item) => item.kind === 'mcp'),
  }), [filteredItems]);

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h2>Skills, prompts e MCP</h2>
          <div className="sheet-header-actions">
            <button type="button" className="ghost-button" onClick={onReload}>
              Atualizar
            </button>
            <button type="button" className="ghost-button" onClick={onClose}>
              Fechar
            </button>
          </div>
        </div>
        <input
          className="sheet-search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Buscar por skill, prompt, MCP ou caminho..."
        />
        {isLoading ? <p className="sheet-helper">Lendo diretorios locais e workspaces remotos...</p> : null}
        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
        {!isLoading && !errorMessage && filteredItems.length === 0 ? (
          <p className="sheet-helper">Nenhum recurso do Copilot encontrado com esse filtro.</p>
        ) : null}
        <ResourceGroup title="Skills" items={groups.skills} onSelect={onSelect} />
        <ResourceGroup title="Prompts" items={groups.prompts} onSelect={onSelect} />
        <ResourceGroup title="Servidores MCP" items={groups.mcp} onSelect={onSelect} />
      </section>
    </div>
  );
}

interface ResourceGroupProps {
  title: string;
  items: CopilotResourceItem[];
  onSelect: (item: CopilotResourceItem) => void;
}

function ResourceGroup({ title, items, onSelect }: ResourceGroupProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <div className="command-group">
      <h3>{title}</h3>
      {items.map((item) => (
        <button key={item.id} type="button" className="command-item copilot-resource-item" onClick={() => onSelect(item)}>
          <div>
            <strong>{item.label}</strong>
            <p>{item.description}</p>
            <span className="copilot-resource-item__meta">
              <span className="status-pill">{item.scope === 'local' ? 'Local' : 'Remoto'}</span>
              <span>{item.originLabel}</span>
              <span>{item.invocation.trim()}</span>
            </span>
          </div>
        </button>
      ))}
    </div>
  );
}