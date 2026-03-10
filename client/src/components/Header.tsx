interface HeaderProps {
  connectionTone: 'online' | 'warning' | 'error';
  themeLabel: string;
  onToggleTheme: () => void;
  onEndSession: () => void;
}

export function Header({ connectionTone, themeLabel, onToggleTheme, onEndSession }: HeaderProps) {
  return (
    <header className="terminal-header">
      <div className="header-left">
        <span className={`status-dot status-dot--${connectionTone}`} />
        <button type="button" className="icon-button" onClick={onToggleTheme}>
          {themeLabel}
        </button>
      </div>
      <strong>Copilot</strong>
      <button type="button" className="ghost-button" onClick={onEndSession}>
        Encerrar
      </button>
    </header>
  );
}