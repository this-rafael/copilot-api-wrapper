const quickActions = [
  { label: '↑', value: '\u001b[A' },
  { label: '↓', value: '\u001b[B' },
  { label: '←', value: '\u001b[D' },
  { label: '→', value: '\u001b[C' },
  { label: 'Ctrl+C', value: '\u0003' },
  { label: 'Ctrl+S', value: '\u0013' },
  { label: 'Tab', value: '\t' },
  { label: 'Esc', value: '\u001b' },
  { label: 'Ctrl+D', value: '\u0004' },
  { label: 'Ctrl+L', value: '\u000c' },
];

interface QuickActionsProps {
  onSend: (value: string) => void;
  disabled?: boolean;
}

export function QuickActions({ onSend, disabled = false }: QuickActionsProps) {
  return (
    <div className="quick-actions" aria-label="Acoes rapidas do terminal">
      {quickActions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="quick-action-button"
          disabled={disabled}
          onClick={() => onSend(action.value)}
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}