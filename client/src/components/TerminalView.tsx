interface TerminalViewProps {
  containerRef: (node: HTMLDivElement | null) => void;
}

export function TerminalView({ containerRef }: TerminalViewProps) {
  return <div ref={containerRef} className="terminal-view" />;
}