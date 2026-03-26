import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PromptAutocompleteAssist } from './PromptAutocompleteAssist';
import { PromptFullscreenEditor } from './PromptFullscreenEditor';

interface InputBarProps {
  value: string;
  cursor: number;
  rawMode: boolean;
  disabled: boolean;
  autocompleteStatus: 'idle' | 'loading' | 'ready' | 'error';
  autocompletePreview: string | null;
  autocompleteMessage: string | null;
  onChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onSend: () => void;
  onAcceptAutocomplete: () => void;
  onDismissAutocomplete: () => void;
  onToggleCommands: () => void;
  onToggleCopilotResources: () => void;
  onToggleRawMode: () => void;
  promptImproveStatus?: 'idle' | 'loading';
  onPromptImprove?: () => void;
}

export function InputBar(props: InputBarProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const inlineInputRef = useRef<HTMLTextAreaElement | null>(null);
  const [fullscreenCursor, setFullscreenCursor] = useState(props.cursor);
  const pendingCursorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (fullscreenOpen) {
      return;
    }

    const cursor = pendingCursorRef.current;
    if (cursor === null) {
      return;
    }

    const element = inlineInputRef.current;
    pendingCursorRef.current = null;

    if (!element) {
      return;
    }

    element.focus();
    element.setSelectionRange(cursor, cursor);
    props.onCursorChange(cursor);
  }, [fullscreenOpen, props]);

  useEffect(() => {
    if (!fullscreenOpen || (!props.disabled && !props.rawMode)) {
      return;
    }

    closeFullscreenEditor();
  }, [fullscreenOpen, props.disabled, props.rawMode]);

  useEffect(() => {
    if (!fullscreenOpen) {
      return;
    }

    setFullscreenCursor(props.cursor);
  }, [fullscreenOpen, props.cursor]);

  function openFullscreenEditor() {
    if (props.disabled || props.rawMode) {
      return;
    }

    const cursor = inlineInputRef.current?.selectionStart ?? props.cursor;
    setFullscreenCursor(cursor);
    setFullscreenOpen(true);
  }

  function closeFullscreenEditor(nextCursor?: number) {
    pendingCursorRef.current = nextCursor ?? fullscreenCursor;
    setFullscreenOpen(false);
  }

  function handleSendFromFullscreen() {
    if (props.disabled || !props.value.trim()) {
      return;
    }

    props.onSend();
  }

  function insertLineBreak() {
    if (props.disabled || props.rawMode) {
      return;
    }

    const element = inlineInputRef.current;
    const start = element?.selectionStart ?? props.cursor;
    const end = element?.selectionEnd ?? start;
    const nextValue = `${props.value.slice(0, start)}\n${props.value.slice(end)}`;
    const nextCursor = start + 1;

    pendingCursorRef.current = nextCursor;
    props.onChange(nextValue, nextCursor);
  }

  function reportCursor() {
    const cursor = inlineInputRef.current?.selectionStart ?? props.cursor;
    props.onCursorChange(cursor);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Escape' && (props.autocompletePreview || props.autocompleteMessage)) {
      event.preventDefault();
      props.onDismissAutocomplete();
      return;
    }

    if (event.key === 'Tab' && !props.rawMode && props.autocompletePreview) {
      event.preventDefault();
      props.onAcceptAutocomplete();
      return;
    }

    if (event.key !== 'Enter') {
      return;
    }

    event.preventDefault();

    if (props.rawMode || event.ctrlKey || event.metaKey) {
      props.onSend();
      return;
    }

    insertLineBreak();
  }

  return (
    <div className="input-bar">
      <div className="input-bar__controls">
        <button type="button" className="ghost-button input-bar__commands" onClick={props.onToggleCommands}>
          Commands
        </button>
        <button type="button" className="ghost-button input-bar__commands" onClick={props.onToggleCopilotResources}>
          Copilot
        </button>
        <button
          type="button"
          className={`ghost-button raw-toggle${props.rawMode ? ' raw-toggle--active' : ''}`}
          onClick={props.onToggleRawMode}
          aria-pressed={props.rawMode}
        >
          <span>Raw</span>
          <strong>{props.rawMode ? 'Ligado' : 'Composer'}</strong>
        </button>
      </div>
      <textarea
        ref={inlineInputRef}
        value={props.value}
        disabled={props.disabled}
        className="input-bar__field"
        placeholder={props.rawMode ? 'Modo raw: teclas vao direto para o terminal...' : 'Digite um comando ou prompt...'}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        rows={2}
        enterKeyHint={props.rawMode ? 'send' : 'enter'}
        inputMode="text"
        onChange={(event) => props.onChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onClick={reportCursor}
        onFocus={reportCursor}
        onKeyUp={reportCursor}
        onSelect={reportCursor}
        onKeyDown={handleKeyDown}
      />
      {!fullscreenOpen ? (
        <PromptAutocompleteAssist
          rawMode={props.rawMode}
          disabled={props.disabled}
          autocompleteStatus={props.autocompleteStatus}
          autocompletePreview={props.autocompletePreview}
          autocompleteMessage={props.autocompleteMessage}
          onAcceptAutocomplete={props.onAcceptAutocomplete}
          onDismissAutocomplete={props.onDismissAutocomplete}
        />
      ) : null}
      <div className="input-bar__actions">
        <button
          type="button"
          className="ghost-button input-bar__fullscreen"
          disabled={props.disabled || props.rawMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={openFullscreenEditor}
        >
          Tela cheia
        </button>
        <button
          type="button"
          className="ghost-button input-bar__newline"
          disabled={props.disabled || props.rawMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertLineBreak}
        >
          Linha
        </button>
        {!props.rawMode && props.onPromptImprove ? (
          <button
            type="button"
            className="ghost-button input-bar__prompt-improve"
            disabled={props.disabled || !props.value.trim() || props.promptImproveStatus === 'loading'}
            onMouseDown={(event) => event.preventDefault()}
            onClick={props.onPromptImprove}
          >
            {props.promptImproveStatus === 'loading' ? '✨ Melhorando…' : '✨ Melhorar'}
          </button>
        ) : null}
        <button
          type="button"
          className="primary-button input-send"
          disabled={props.disabled || (!props.rawMode && !props.value.trim())}
          onClick={props.onSend}
        >
          Enviar
        </button>
      </div>
      {fullscreenOpen ? (
        <PromptFullscreenEditor
          value={props.value}
          cursor={fullscreenCursor}
          disabled={props.disabled}
          autocompleteStatus={props.autocompleteStatus}
          autocompletePreview={props.autocompletePreview}
          autocompleteMessage={props.autocompleteMessage}
          onChange={(value, cursor) => {
            setFullscreenCursor(cursor);
            props.onChange(value, cursor);
          }}
          onCursorChange={(cursor) => {
            setFullscreenCursor(cursor);
            props.onCursorChange(cursor);
          }}
          onClose={closeFullscreenEditor}
          onSend={handleSendFromFullscreen}
          onAcceptAutocomplete={props.onAcceptAutocomplete}
          onDismissAutocomplete={props.onDismissAutocomplete}
        />
      ) : null}
    </div>
  );
}
