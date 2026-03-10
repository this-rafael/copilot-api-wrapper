import { useState } from 'react';
import type { CommandProfile, WorkspaceInfo } from '../lib/protocol';

interface ConnectionScreenProps {
  url: string;
  token: string;
  selectedWorkspace: WorkspaceInfo | null;
  workspaceCount: number;
  workspaceStatus: 'idle' | 'loading' | 'ready' | 'error';
  workspaceErrorMessage: string | null;
  themeLabel: string;
  status: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  errorMessage: string | null;
  onUrlChange: (value: string) => void;
  onTokenChange: (value: string) => void;
  onLoadWorkspaces: () => void;
  onOpenWorkspacePicker: () => void;
  onToggleTheme: () => void;
  onConnect: (commandProfile: CommandProfile) => void;
}

export function ConnectionScreen(props: ConnectionScreenProps) {
  const [profile, setProfile] = useState<CommandProfile>('copilot-interactive');
  const isConnecting = props.status === 'connecting' || props.status === 'reconnecting';
  const isLoadingWorkspaces = props.workspaceStatus === 'loading';
  const canStartSession = props.status === 'open'
    && props.workspaceStatus === 'ready'
    && props.selectedWorkspace !== null;
  const submitLabel = isConnecting
    ? 'Conectando...'
    : isLoadingWorkspaces
      ? 'Carregando workspaces...'
      : props.status === 'open'
        ? 'Iniciar sessao'
        : 'Conectar e carregar workspaces';
  const loadWorkspacesLabel = props.status === 'open' ? 'Atualizar lista' : 'Conectar para listar';

  return (
    <section className="connection-screen card-shell">
      <div className="connection-screen__topbar">
        <span className="brand-kicker">Mobile-first wrapper</span>
        <button
          type="button"
          className="icon-button"
          onClick={props.onToggleTheme}
          aria-label="Alternar tema"
        >
          {props.themeLabel}
        </button>
      </div>

      <div className="brand-block">
        <h1>Copilot Remote</h1>
        <p>Conecte ao wrapper WebSocket e opere o Copilot CLI com terminal real no celular.</p>
      </div>

      <form
        className="connection-screen__form"
        autoComplete="off"
        onSubmit={(event) => {
          event.preventDefault();
          props.onConnect(profile);
        }}
      >
        <label className="field-group">
          <span>Server URL</span>
          <input
            value={props.url}
            onChange={(event) => props.onUrlChange(event.target.value)}
            placeholder="ws://192.168.1.5:3000"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            inputMode="url"
            enterKeyHint="next"
            autoComplete="url"
          />
        </label>

        <label className="field-group">
          <span>Token</span>
          <input
            type="password"
            value={props.token}
            onChange={(event) => props.onTokenChange(event.target.value)}
            placeholder="WS auth token"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            autoComplete="current-password"
          />
        </label>

        <label className="field-group">
          <span>Workspace remoto</span>
          <div className={`workspace-card${props.selectedWorkspace ? '' : ' workspace-card--empty'}`}>
            {props.selectedWorkspace ? (
              <>
                <strong>{props.selectedWorkspace.name}</strong>
                <span>{props.selectedWorkspace.path}</span>
              </>
            ) : (
              <p className="empty-hint">Carregue a lista e escolha um workspace permitido ou cadastre um customizado.</p>
            )}
          </div>
          <div className="workspace-actions">
            <button
              type="button"
              className="ghost-button"
              onClick={props.onLoadWorkspaces}
              disabled={isConnecting || isLoadingWorkspaces}
            >
              {isLoadingWorkspaces ? 'Carregando...' : loadWorkspacesLabel}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={props.onOpenWorkspacePicker}
              disabled={props.workspaceStatus !== 'ready'}
            >
              Escolher workspace
            </button>
          </div>
          {props.workspaceStatus === 'ready' ? (
            <p className="field-help">{props.workspaceCount} workspace(s) disponiveis para esta conexao.</p>
          ) : null}
          {props.workspaceErrorMessage ? <p className="inline-error">{props.workspaceErrorMessage}</p> : null}
        </label>

        <label className="field-group">
          <span>Perfil de comando</span>
          <select value={profile} onChange={(event) => setProfile(event.target.value as CommandProfile)}>
            <option value="copilot-interactive">copilot-interactive</option>
            <option value="gh-copilot-suggest">gh-copilot-suggest</option>
          </select>
        </label>

        {props.errorMessage ? <p className="inline-error">{props.errorMessage}</p> : null}

        <button
          type="submit"
          className="primary-button"
          disabled={isConnecting || isLoadingWorkspaces || (props.status === 'open' && !canStartSession)}
        >
          {submitLabel}
        </button>
      </form>
    </section>
  );
}