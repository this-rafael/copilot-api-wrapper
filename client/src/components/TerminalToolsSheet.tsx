interface TerminalToolsSheetProps {
  open: boolean;
  fontSize: number;
  outputHistoryHasContent: boolean;
  outputOrientation: 'portrait' | 'landscape';
  onClose: () => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onOpenCopyOutput: () => void;
  onToggleOutputOrientation: () => void;
  onEnterFullscreen: () => void | Promise<void>;
}

export function TerminalToolsSheet({
  open,
  fontSize,
  outputHistoryHasContent,
  outputOrientation,
  onClose,
  onIncreaseFont,
  onDecreaseFont,
  onOpenCopyOutput,
  onToggleOutputOrientation,
  onEnterFullscreen,
}: TerminalToolsSheetProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section
        className="sheet-panel terminal-tools-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="terminal-tools-sheet-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="sheet-header-row">
          <h2 id="terminal-tools-sheet-title">Ferramentas do terminal</h2>
          <button type="button" className="ghost-button" onClick={onClose}>
            Fechar
          </button>
        </div>

        <div className="terminal-tools-sheet__row">
          <button type="button" className="ghost-button" onClick={onDecreaseFont}>
            A−
          </button>
          <span className="terminal-tools-sheet__label">{fontSize}px</span>
          <button type="button" className="ghost-button" onClick={onIncreaseFont}>
            A+
          </button>
        </div>

        <button
          type="button"
          className="ghost-button terminal-tools-sheet__item"
          onClick={() => {
            onOpenCopyOutput();
            onClose();
          }}
          disabled={!outputHistoryHasContent}
          aria-label="Abrir popup para copiar linhas do output"
        >
          Copiar output
        </button>

        <button
          type="button"
          className={`ghost-button terminal-tools-sheet__item output-orientation-toggle output-orientation-toggle--${outputOrientation}`}
          onClick={onToggleOutputOrientation}
          aria-label={`Alternar visualizacao do terminal. Atual: ${outputOrientation}`}
        >
          <span>Output</span>
          <strong>{outputOrientation === 'portrait' ? 'Portrait' : 'Landscape'}</strong>
        </button>

        <button
          type="button"
          className="ghost-button terminal-tools-sheet__item"
          onClick={() => {
            void onEnterFullscreen();
            onClose();
          }}
          aria-label="Abrir terminal em tela cheia"
        >
          Tela cheia
        </button>
      </section>
    </div>
  );
}