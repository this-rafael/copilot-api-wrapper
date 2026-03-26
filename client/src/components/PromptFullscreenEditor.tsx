import { useEffect, useRef } from 'react';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { HighlightStyle, indentOnInput, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { EditorSelection, EditorState, Prec } from '@codemirror/state';
import {
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
  type ViewUpdate,
} from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { createPortal } from 'react-dom';

interface PromptFullscreenEditorProps {
  value: string;
  cursor: number;
  disabled: boolean;
  autocompleteStatus: 'idle' | 'loading' | 'ready' | 'error';
  autocompletePreview: string | null;
  autocompleteMessage: string | null;
  onChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onClose: (cursor?: number) => void;
  onSend: () => void;
  onAcceptAutocomplete: () => void;
  onDismissAutocomplete: () => void;
}

function clampCursor(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

const promptHighlightStyle = HighlightStyle.define([
  { tag: [tags.heading, tags.heading1, tags.heading2, tags.heading3, tags.heading4, tags.heading5, tags.heading6], color: 'var(--accent)', fontWeight: '700' },
  { tag: tags.quote, color: 'color-mix(in srgb, var(--warning) 64%, var(--text-primary))' },
  { tag: tags.monospace, color: 'var(--accent-secondary)' },
  { tag: [tags.url, tags.link], color: 'color-mix(in srgb, var(--accent) 62%, var(--text-primary))', textDecoration: 'underline' },
  { tag: tags.strong, color: 'var(--text-primary)', fontWeight: '700' },
  { tag: tags.emphasis, color: 'color-mix(in srgb, var(--warning) 58%, var(--text-primary))', fontStyle: 'italic' },
  { tag: [tags.meta, tags.comment], color: 'var(--text-secondary)' },
]);

function insertSoftTab(view: EditorView): boolean {
  const changes = view.state.changeByRange((range) => ({
    changes: {
      from: range.from,
      to: range.to,
      insert: '  ',
    },
    range: EditorSelection.cursor(range.from + 2),
  }));

  view.dispatch(changes);
  return true;
}

function insertLineBreak(view: EditorView): boolean {
  const changes = view.state.changeByRange((range) => ({
    changes: {
      from: range.from,
      to: range.to,
      insert: '\n',
    },
    range: EditorSelection.cursor(range.from + 1),
  }));

  view.dispatch(changes);
  return true;
}

export function PromptFullscreenEditor(props: PromptFullscreenEditorProps) {
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const applyingExternalChangeRef = useRef(false);
  const latestPropsRef = useRef(props);
  const latestValueRef = useRef(props.value);
  const latestCursorRef = useRef(props.cursor);

  latestPropsRef.current = props;

  useEffect(() => {
    latestValueRef.current = props.value;
    latestCursorRef.current = props.cursor;
  }, [props.cursor, props.value]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('prompt-editor-open');

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('prompt-editor-open');
    };
  }, []);

  useEffect(() => {
    const host = editorRootRef.current;
    if (!host) {
      return;
    }

    const startCursor = clampCursor(props.cursor, props.value.length);
    latestCursorRef.current = startCursor;

    const view = new EditorView({
      state: EditorState.create({
        doc: props.value,
        selection: EditorSelection.cursor(startCursor),
        extensions: [
          lineNumbers(),
          highlightActiveLineGutter(),
          history(),
          drawSelection(),
          dropCursor(),
          indentOnInput(),
          syntaxHighlighting(promptHighlightStyle),
          highlightActiveLine(),
          markdown(),
          indentUnit.of('  '),
          EditorView.lineWrapping,
          EditorView.editable.of(!props.disabled),
          EditorView.contentAttributes.of({
            'aria-label': 'Editor do prompt em tela cheia',
            'aria-multiline': 'true',
            autocapitalize: 'off',
            autocorrect: 'off',
            role: 'textbox',
            spellcheck: 'false',
          }),
          placeholder('Escreva seu prompt como em um editor de codigo...'),
          Prec.high(
            keymap.of([
              {
                key: 'Escape',
                run: () => {
                  latestPropsRef.current.onClose(latestCursorRef.current);
                  return true;
                },
              },
              {
                key: 'Mod-Enter',
                run: () => {
                  if (latestPropsRef.current.disabled || !latestValueRef.current.trim()) {
                    return true;
                  }

                  latestPropsRef.current.onSend();
                  latestPropsRef.current.onClose(0);
                  return true;
                },
              },
              {
                key: 'Tab',
                run: (editorView) => {
                  if (latestPropsRef.current.autocompletePreview) {
                    latestPropsRef.current.onAcceptAutocomplete();
                    return true;
                  }

                  return insertSoftTab(editorView);
                },
              },
            ]),
          ),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update: ViewUpdate) => {
            const nextValue = update.state.doc.toString();
            const nextCursor = update.state.selection.main.head;

            latestValueRef.current = nextValue;
            latestCursorRef.current = nextCursor;

            if (applyingExternalChangeRef.current) {
              return;
            }

            if (update.docChanged) {
              latestPropsRef.current.onChange(nextValue, nextCursor);
              return;
            }

            if (update.selectionSet) {
              latestPropsRef.current.onCursorChange(nextCursor);
            }
          }),
        ],
      }),
      parent: host,
    });

    editorViewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      editorViewRef.current = null;
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    const nextValue = props.value;
    const nextCursor = clampCursor(props.cursor, nextValue.length);
    const currentValue = view.state.doc.toString();
    const currentCursor = view.state.selection.main.head;

    if (currentValue === nextValue && currentCursor === nextCursor) {
      return;
    }

    applyingExternalChangeRef.current = true;
    view.dispatch({
      changes: currentValue === nextValue ? undefined : {
        from: 0,
        to: currentValue.length,
        insert: nextValue,
      },
      selection: EditorSelection.cursor(nextCursor),
      scrollIntoView: true,
    });
    applyingExternalChangeRef.current = false;
  }, [props.cursor, props.value]);

  function closeEditor(nextCursor?: number) {
    props.onClose(nextCursor ?? latestCursorRef.current);
  }

  function handleSend() {
    if (props.disabled || !latestValueRef.current.trim()) {
      return;
    }

    props.onSend();
    props.onClose(0);
  }

  function handleInsertLineBreak() {
    const view = editorViewRef.current;
    if (!view || props.disabled) {
      return;
    }

    insertLineBreak(view);
    view.focus();
  }

  const showAutocompletePreview = Boolean(props.autocompletePreview);
  const showAutocompleteMessage = Boolean(props.autocompleteMessage) && !showAutocompletePreview;
  const showAutocompleteLoading = props.autocompleteStatus === 'loading' && !showAutocompletePreview && !showAutocompleteMessage;

  return createPortal(
    <div className="prompt-editor-backdrop" onClick={() => closeEditor()}>
      <section
        className="prompt-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="prompt-editor__header">
          <div className="prompt-editor__heading">
            <h2 id="prompt-editor-title">Editor do prompt</h2>
          </div>
          <div className="prompt-editor__actions">
            <button type="button" className="ghost-button prompt-editor__action" onClick={() => closeEditor()}>
              Fechar
            </button>
            <button
              type="button"
              className="primary-button prompt-editor__action prompt-editor__action--primary"
              disabled={!props.value.trim() || props.disabled}
              onClick={handleSend}
            >
              Enviar
            </button>
          </div>
        </div>

        <div className="prompt-editor__workspace">
          <div ref={editorRootRef} className="prompt-editor__editor" />
        </div>

        <div className="prompt-editor__footer">
          {showAutocompletePreview ? (
            <div className="prompt-editor__suggestion" aria-live="polite">
              <span>Copilot</span>
              <p>{props.autocompletePreview}</p>
            </div>
          ) : null}

          <div className="prompt-editor__toolbar">
            <div className="prompt-editor__toolbar-group">
              <button type="button" className="ghost-button prompt-editor__chip" disabled={props.disabled} onClick={handleInsertLineBreak}>
                Linha
              </button>
              {showAutocompletePreview ? (
                <button type="button" className="ghost-button prompt-editor__chip" onClick={props.onAcceptAutocomplete}>
                  Aceitar
                </button>
              ) : null}
            </div>

            <div className="prompt-editor__toolbar-group prompt-editor__toolbar-group--end">
              {showAutocompleteLoading ? <span className="prompt-editor__status">Copilot pensando</span> : null}
              {showAutocompleteMessage ? <span className="prompt-editor__status">{props.autocompleteMessage}</span> : null}
              {showAutocompleteMessage ? (
                <button type="button" className="ghost-button prompt-editor__chip" onClick={props.onDismissAutocomplete}>
                  Ocultar
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}