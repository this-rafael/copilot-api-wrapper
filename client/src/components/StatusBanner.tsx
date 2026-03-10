interface StatusBannerProps {
  tone: 'neutral' | 'warning' | 'error' | 'success';
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function StatusBanner({ tone, message, actionLabel, onAction }: StatusBannerProps) {
  return (
    <div className={`status-banner status-banner--${tone}`} role="status" aria-live="polite">
      <span>{message}</span>
      {actionLabel && onAction ? (
        <button type="button" className="ghost-button" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}