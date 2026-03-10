import { useEffect, useMemo, useState } from 'react';
import type { WorkspaceInfo } from '../lib/protocol';

interface WorkspacePickerProps {
  open: boolean;
  workspaces: WorkspaceInfo[];
  selectedPath: string | null;
  errorMessage: string | null;
  isBusy: boolean;
  onClose: () => void;
  onAddCustomWorkspace: (path: string) => void;
  onSelect: (workspace: WorkspaceInfo) => void;
}

export function WorkspacePicker({
  open,
  workspaces,
  selectedPath,
  errorMessage,
  isBusy,
  onClose,
  onAddCustomWorkspace,
  onSelect,
}: WorkspacePickerProps) {
  const [query, setQuery] = useState('');
  const [customPath, setCustomPath] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
      setCustomPath('');
    }
  }, [open]);

  const filteredWorkspaces = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) {
      return workspaces;
    }

    return workspaces.filter((workspace) => {
      return workspace.name.toLowerCase().includes(normalizedQuery)
        || workspace.path.toLowerCase().includes(normalizedQuery);
    });
  }, [query, workspaces]);

  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet-panel" onClick={(event) => event.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h2>Workspaces</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>
        <input
          type="search"
          className="sheet-search"
          value={query}
          placeholder="Buscar por nome ou path..."
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        <form
          className="workspace-picker__custom-form"
          onSubmit={(event) => {
            event.preventDefault();
            const normalized = customPath.trim();
            if (!normalized) {
              return;
            }

            onAddCustomWorkspace(normalized);
          }}
        >
          <input
            type="text"
            className="sheet-search"
            value={customPath}
            placeholder="Adicionar workspace customizado: /caminho/absoluto"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            disabled={isBusy}
            onChange={(event) => setCustomPath(event.target.value)}
          />
          <button type="submit" className="ghost-button" disabled={isBusy || customPath.trim().length === 0}>
            {isBusy ? 'Salvando...' : 'Salvar workspace'}
          </button>
        </form>
        {errorMessage ? <p className="inline-error">{errorMessage}</p> : null}
        {filteredWorkspaces.length === 0 ? <p className="empty-hint">Nenhum workspace encontrado.</p> : null}
        {filteredWorkspaces.map((workspace) => {
          const isSelected = selectedPath === workspace.path;

          return (
            <button
              key={workspace.path}
              type="button"
              className={`workspace-item${isSelected ? ' workspace-item--selected' : ''}`}
              onClick={() => onSelect(workspace)}
            >
              <div className="workspace-item__header">
                <strong>{workspace.name}</strong>
                {isSelected ? <span className="workspace-badge">Selecionado</span> : null}
              </div>
              <span>{workspace.path}</span>
            </button>
          );
        })}
      </section>
    </div>
  );
}