interface PromptAutocompleteAssistProps {
  rawMode: boolean;
  disabled: boolean;
  autocompleteStatus: 'idle' | 'loading' | 'ready' | 'error';
  autocompletePreview: string | null;
  autocompleteMessage: string | null;
  onAcceptAutocomplete: () => void;
  onDismissAutocomplete: () => void;
}

export function PromptAutocompleteAssist(props: PromptAutocompleteAssistProps) {
  if (props.rawMode || props.disabled) {
    return null;
  }

  const showSuggestion = Boolean(props.autocompletePreview);
  const showLoading = props.autocompleteStatus === 'loading';
  const showMessage = Boolean(props.autocompleteMessage) && !showSuggestion;

  if (!showSuggestion && !showLoading && !showMessage) {
    return null;
  }

  return (
    <div className={`autocomplete-assist autocomplete-assist--${showSuggestion ? 'ready' : showLoading ? 'loading' : 'error'}`}>
      <div className="autocomplete-assist__meta">
        <strong>Copilot</strong>
        <span>
          {showSuggestion ? 'Sugestao pronta' : showLoading ? 'Gerando sugestao...' : 'Autocomplete indisponivel'}
        </span>
      </div>

      {showSuggestion ? <pre className="autocomplete-assist__preview">{props.autocompletePreview}</pre> : null}
      {showMessage ? <p className="autocomplete-assist__message">{props.autocompleteMessage}</p> : null}

      {showSuggestion || showMessage ? (
        <div className="autocomplete-assist__actions">
          {showSuggestion ? (
            <button type="button" className="ghost-button" onClick={props.onAcceptAutocomplete}>
              Aplicar
            </button>
          ) : null}
          <button type="button" className="ghost-button" onClick={props.onDismissAutocomplete}>
            Ocultar
          </button>
        </div>
      ) : null}
    </div>
  );
}