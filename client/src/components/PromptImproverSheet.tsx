import { useEffect, useRef, useState } from 'react';

interface PromptImproverSheetProps {
  status: 'idle' | 'loading' | 'ready' | 'error';
  improvedPrompt: string | null;
  errorMessage: string | null;
  onApprove: (prompt: string) => void;
  onCancel: () => void;
}

export function PromptImproverSheet({
  status,
  improvedPrompt,
  errorMessage,
  onApprove,
  onCancel,
}: PromptImproverSheetProps) {
  const [editedPrompt, setEditedPrompt] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (status === 'ready' && improvedPrompt !== null) {
      setEditedPrompt(improvedPrompt);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [status, improvedPrompt]);

  return (
    <div className="prompt-improver-backdrop" onClick={onCancel}>
      <div
        className="prompt-improver-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Prompt Melhorado"
      >
        <div className="prompt-improver-header">
          <span className="prompt-improver-title">✨ Prompt Melhorado</span>
          <button className="prompt-improver-close" onClick={onCancel} aria-label="Fechar">
            ✕
          </button>
        </div>

        {status === 'loading' && (
          <div className="prompt-improver-loading">
            <div className="prompt-improver-spinner" />
            <span>Analisando e melhorando o prompt…</span>
          </div>
        )}

        {status === 'error' && (
          <div className="prompt-improver-error">
            <span>❌ {errorMessage ?? 'Erro ao melhorar o prompt. Tente novamente.'}</span>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p className="prompt-improver-hint">
              Revise e edite o prompt abaixo antes de usar.
            </p>
            <textarea
              ref={textareaRef}
              className="prompt-improver-textarea"
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              rows={12}
            />
            <div className="prompt-improver-actions">
              <button className="prompt-improver-btn prompt-improver-btn--cancel" onClick={onCancel}>
                Cancelar
              </button>
              <button
                className="prompt-improver-btn prompt-improver-btn--approve"
                onClick={() => onApprove(editedPrompt)}
                disabled={!editedPrompt.trim()}
              >
                Usar este prompt
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
