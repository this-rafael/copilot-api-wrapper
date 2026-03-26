interface TerminalViewProps {
  containerRef: (node: HTMLDivElement | null) => void;
  orientation: 'portrait' | 'landscape';
  fullscreen: boolean;
}

export function TerminalView({ containerRef, orientation, fullscreen }: TerminalViewProps) {
  return (
    <div className={`terminal-view terminal-view--${orientation}${fullscreen ? ' terminal-view--fullscreen' : ''}`}>
      <div className="terminal-view__stage">
        <div className="terminal-view__surface">
          <div ref={containerRef} className="terminal-view__terminal" />
        </div>
      </div>
    </div>
  );
}
