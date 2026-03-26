import type { SessionStatus } from '../hooks/useSession';

interface SessionDrawerProps {
  open: boolean;
  confirmEndSession?: boolean;
  filesDisabled?: boolean;
  gitDisabled?: boolean;
  fontSize: number;
  outputHistoryHasContent: boolean;
  outputOrientation: 'portrait' | 'landscape';
  sessions: Array<{
    id: string;
    label: string;
    path: string;
    status: SessionStatus;
    active: boolean;
    hasDraft: boolean;
  }>;
  onClose: () => void;
  onOpenFiles: () => void;
  onOpenGit?: () => void;
  onOpenCopyOutput: () => void;
  onCreateSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onEndSession: () => void;
  onCloseSessionTab: (sessionId: string) => void;
  onToggleTheme: () => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onToggleOutputOrientation: () => void;
  onEnterFullscreen: () => void | Promise<void>;
  themeLabel: string;
}

function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case 'creating':
      return 'Conectando';
    case 'active':
      return 'Ativa';
    case 'disconnected':
      return 'Offline';
    case 'error':
      return 'Erro';
    case 'closed':
      return 'Encerrada';
    default:
      return 'Pronta';
  }
}

export function SessionDrawer({
  open,
  confirmEndSession = false,
  filesDisabled = false,
  gitDisabled = false,
  fontSize,
  outputHistoryHasContent,
  outputOrientation,
  sessions,
  onClose,
  onOpenFiles,
  onOpenGit,
  onOpenCopyOutput,
  onCreateSession,
  onSelectSession,
  onEndSession,
  onCloseSessionTab,
  onToggleTheme,
  onIncreaseFont,
  onDecreaseFont,
  onToggleOutputOrientation,
  onEnterFullscreen,
  themeLabel,
}: SessionDrawerProps) {
  if (!open) {
    return null;
  }

  const activeSession = sessions.find((session) => session.active) ?? sessions[0] ?? null;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet-panel session-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-drawer-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header-row session-drawer__header">
          <div className="session-drawer__heading">
            <h2 id="session-drawer-title">Menu</h2>
            <p>
              {activeSession ? `Ativa: ${activeSession.label}` : 'Nenhuma sessão ativa'}
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="session-drawer__actions">
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              onCreateSession();
              onClose();
            }}
          >
            + Sessão
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={filesDisabled}
            onClick={() => {
              onOpenFiles();
              onClose();
            }}
          >
            Arquivos
          </button>
          {onOpenGit ? (
            <button
              type="button"
              className="ghost-button"
              disabled={gitDisabled}
              onClick={() => {
                onOpenGit();
                onClose();
              }}
            >
              Git
            </button>
          ) : null}
          <button
            type="button"
            className="ghost-button"
            onClick={() => {
              const shouldClose = confirmEndSession;
              onEndSession();
              if (shouldClose) {
                onClose();
              }
            }}
          >
            {confirmEndSession ? 'Confirmar encerramento' : 'Encerrar'}
          </button>
        </div>

        {confirmEndSession ? <p className="session-drawer__hint">Toque novamente para encerrar a sessão atual.</p> : null}

        <div className="session-drawer__section">
          <div className="session-drawer__section-heading">
            <h3>Controles</h3>
            <span>{fontSize}px</span>
          </div>
          <div className="session-drawer__controls">
            <button type="button" className="ghost-button" onClick={onDecreaseFont}>
              A-
            </button>
            <button type="button" className="ghost-button" onClick={onIncreaseFont}>
              A+
            </button>
            <button
              type="button"
              className="ghost-button"
              disabled={!outputHistoryHasContent}
              onClick={() => {
                onOpenCopyOutput();
                onClose();
              }}
            >
              Copiar
            </button>
            <button type="button" className="ghost-button" onClick={onToggleTheme}>
              Tema {themeLabel}
            </button>
            <button type="button" className="ghost-button" onClick={onToggleOutputOrientation}>
              Output {outputOrientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </button>
            <button
              type="button"
              className="ghost-button"
              onClick={() => {
                void onEnterFullscreen();
                onClose();
              }}
            >
              Tela cheia
            </button>
          </div>
        </div>

        <div className="session-drawer__section">
          <div className="session-drawer__section-heading">
            <h3>Sessões</h3>
            <span>{sessions.length}</span>
          </div>

          <div className="session-drawer__list" role="list" aria-label="Sessões abertas">
            {sessions.map((session) => (
              <div
                key={session.id}
                className={`session-drawer__item${session.active ? ' session-drawer__item--active' : ''}`}
                role="listitem"
              >
                <button
                  type="button"
                  className="session-drawer__trigger"
                  aria-pressed={session.active}
                  onClick={() => {
                    onSelectSession(session.id);
                    onClose();
                  }}
                >
                  <span className="session-drawer__label-row">
                    <strong>{session.label}</strong>
                    <span className={`session-tab__state session-tab__state--${session.status}`}>
                      {getStatusLabel(session.status)}
                    </span>
                  </span>
                  <span className="session-drawer__meta-row">
                    <span className="session-drawer__path">{session.path}</span>
                    {session.hasDraft ? <span className="session-tab__draft">Rascunho</span> : null}
                  </span>
                </button>
                <button
                  type="button"
                  className="session-drawer__close"
                  aria-label={`Fechar sessao do workspace ${session.label}`}
                  onClick={() => onCloseSessionTab(session.id)}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}