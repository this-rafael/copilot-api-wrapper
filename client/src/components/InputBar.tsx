import { useLayoutEffect, useRef } from 'react';

interface InputBarProps {
  value: string;
  cursor: number;
  rawMode: boolean;
  disabled: boolean;
  onChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onSend: () => void;
  onToggleCommands: () => void;
  onToggleRawMode: () => void;
}

export function InputBar(props: InputBarProps) {
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const pendingCursorRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    const cursor = pendingCursorRef.current;
    if (cursor === null) {
      return;
    }

    const element = inputRef.current;
    pendingCursorRef.current = null;

    if (!element) {
      return;
    }

    element.focus();
    element.setSelectionRange(cursor, cursor);
    props.onCursorChange(cursor);
  }, [props]);

  function insertLineBreak() {
    if (props.disabled || props.rawMode) {
      return;
    }

    const start = inputRef.current?.selectionStart ?? props.cursor;
    const end = inputRef.current?.selectionEnd ?? start;
    const nextValue = `${props.value.slice(0, start)}\n${props.value.slice(end)}`;
    const nextCursor = start + 1;

    pendingCursorRef.current = nextCursor;
    props.onChange(nextValue, nextCursor);
  }

  function reportCursor() {
    const cursor = inputRef.current?.selectionStart ?? props.cursor;
    props.onCursorChange(cursor);
  }

  return (
    <div className="input-bar">
      <div className="input-bar__controls">
        <button type="button" className="ghost-button input-bar__commands" onClick={props.onToggleCommands}>
          Commands
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
        ref={inputRef}
        value={props.value}
        disabled={props.disabled}
        className="input-bar__field"
        placeholder={props.rawMode ? 'Modo raw: teclas vao direto para o terminal...' : 'Digite um comando ou prompt...'}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        rows={3}
        enterKeyHint={props.rawMode ? 'send' : 'enter'}
        onChange={(event) => props.onChange(event.target.value, event.target.selectionStart ?? event.target.value.length)}
        onClick={reportCursor}
        onFocus={reportCursor}
        onKeyUp={reportCursor}
        onSelect={reportCursor}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();

            if (props.rawMode || event.ctrlKey || event.metaKey) {
              props.onSend();
              return;
            }

            insertLineBreak();
          }
        }}
      />
      <div className="input-bar__actions">
        <button
          type="button"
          className="ghost-button input-bar__newline"
          disabled={props.disabled || props.rawMode}
          onMouseDown={(event) => event.preventDefault()}
          onClick={insertLineBreak}
        >
          Linha
        </button>
        <button
          type="button"
          className="primary-button input-send"
          disabled={props.disabled || (!props.rawMode && !props.value.trim())}
          onClick={props.onSend}
        >
          Enviar
        </button>
      </div>
    </div>
  );
}