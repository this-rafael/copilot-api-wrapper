interface HeaderProps {
  activeSessionLabel: string;
  connectionTone: 'online' | 'warning' | 'error';
  themeLabel: string;
  sessionCount: number;
  filesDisabled?: boolean;
  gitDisabled?: boolean;
  onOpenFiles: () => void;
  onOpenGit?: () => void;
  onOpenSessionDrawer: () => void;
  onToggleTheme: () => void;
  onEndSession: () => void;
}

export function Header({
  activeSessionLabel,
  connectionTone,
  themeLabel,
  sessionCount,
  filesDisabled = false,
  gitDisabled = false,
  onOpenFiles,
  onOpenGit,
  onOpenSessionDrawer,
  onToggleTheme,
  onEndSession,
}: HeaderProps) {
  return (
    <header className="terminal-header">
      <div className="header-left">
        <span className={`status-dot status-dot--${connectionTone}`} />
        <div className="header-context" aria-label={`Sessao ativa ${activeSessionLabel}`}>
          <strong>Copilot</strong>
          <span>{activeSessionLabel}</span>
        </div>
      </div>
      <div className="header-right">
        <div className="header-mobile-actions">
          <button
            type="button"
            className="icon-button header-menu-trigger"
            aria-haspopup="dialog"
            aria-label={`Abrir menu principal. ${sessionCount} sessoes abertas`}
            onClick={onOpenSessionDrawer}
          >
            ⋯
          </button>
        </div>
        <div className="header-desktop-actions">
          <button type="button" className="ghost-button" disabled={filesDisabled} onClick={onOpenFiles}>
            Arquivos
          </button>
          {onOpenGit ? (
            <button type="button" className="ghost-button" disabled={gitDisabled} onClick={onOpenGit}>
              Git
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={onEndSession}>
            Encerrar
          </button>
          <button type="button" className="ghost-button header-session-trigger" onClick={onOpenSessionDrawer}>
            Sessões
          </button>
          <button type="button" className="icon-button" onClick={onToggleTheme}>
            {themeLabel}
          </button>
        </div>
      </div>
    </header>
  );
}