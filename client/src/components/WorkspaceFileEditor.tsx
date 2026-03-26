import { useEffect, useRef, useState } from 'react';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
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
import { createPortal } from 'react-dom';
import { createFileLanguageExtension, detectLanguageId } from '../lib/fileLanguages';

interface WorkspaceFileEditorProps {
  open: boolean;
  path: string | null;
  value: string;
  cursor: number;
  status: 'idle' | 'loading' | 'ready' | 'saving' | 'error';
  errorMessage: string | null;
  saveMessage: string | null;
  isDirty: boolean;
  autocompleteStatus: 'idle' | 'loading' | 'ready' | 'error';
  autocompletePreview: string | null;
  autocompleteMessage: string | null;
  onChange: (value: string, cursor: number) => void;
  onCursorChange: (cursor: number) => void;
  onClose: () => void;
  onSave: () => void;
  onAcceptAutocomplete: () => void;
  onDismissAutocomplete: () => void;
}

function clampCursor(value: number, max: number): number {
  return Math.max(0, Math.min(value, max));
}

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

export function WorkspaceFileEditor(props: WorkspaceFileEditorProps) {
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const editorViewRef = useRef<EditorView | null>(null);
  const applyingExternalChangeRef = useRef(false);
  const latestPropsRef = useRef(props);
  const latestValueRef = useRef(props.value);
  const latestCursorRef = useRef(props.cursor);
  const [closeArmed, setCloseArmed] = useState(false);

  latestPropsRef.current = props;

  useEffect(() => {
    latestValueRef.current = props.value;
    latestCursorRef.current = props.cursor;
  }, [props.cursor, props.value]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.body.classList.add('prompt-editor-open');

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.classList.remove('prompt-editor-open');
    };
  }, [props.open]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const handle = window.setTimeout(() => setCloseArmed(false), 1800);
    if (!closeArmed) {
      window.clearTimeout(handle);
    }

    return () => window.clearTimeout(handle);
  }, [closeArmed, props.open]);

  useEffect(() => {
    setCloseArmed(false);
  }, [props.isDirty, props.path]);

  useEffect(() => {
    if (!props.open) {
      return;
    }

    const host = editorRootRef.current;
    if (!host || !props.path) {
      return;
    }

    const startCursor = clampCursor(props.cursor, props.value.length);
    latestCursorRef.current = startCursor;
    const languageId = detectLanguageId(props.path);

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
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          highlightActiveLine(),
          createFileLanguageExtension(props.path),
          EditorView.lineWrapping,
          EditorView.editable.of(props.status !== 'loading'),
          EditorView.contentAttributes.of({
            'aria-label': 'Editor de arquivo em tela cheia',
            'aria-multiline': 'true',
            autocapitalize: 'off',
            autocorrect: 'off',
            role: 'textbox',
            spellcheck: 'false',
          }),
          placeholder('Arquivo vazio'),
          Prec.high(
            keymap.of([
              {
                key: 'Mod-s',
                run: () => {
                  latestPropsRef.current.onSave();
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
  }, [props.open, props.path]);

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

  if (!props.open || !props.path) {
    return null;
  }

  const fileName = props.path.split('/').filter(Boolean).at(-1) ?? props.path;
  const languageId = detectLanguageId(props.path);

  function handleClose() {
    if (props.isDirty && !closeArmed) {
      setCloseArmed(true);
      return;
    }

    props.onClose();
  }

  function handleInsertTab() {
    const view = editorViewRef.current;
    if (!view) {
      return;
    }

    insertSoftTab(view);
    view.focus();
  }

  return createPortal(
    <div className="prompt-editor-backdrop workspace-file-editor-backdrop" onClick={handleClose}>
      <section
        className="prompt-editor workspace-file-editor"
        role="dialog"
        aria-modal="true"
        aria-labelledby="workspace-file-editor-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="prompt-editor__header workspace-file-editor__header">
          <div className="prompt-editor__heading workspace-file-editor__heading">
            <h2 id="workspace-file-editor-title">{fileName}</h2>
            <p>{props.path}</p>
          </div>

          <div className="workspace-file-editor__meta">
            <span className="workspace-file-editor__chip">{languageId}</span>
            {props.isDirty ? <span className="workspace-file-editor__chip workspace-file-editor__chip--dirty">nao salvo</span> : null}
          </div>

          <div className="prompt-editor__actions">
            <button type="button" className="ghost-button prompt-editor__action" onClick={handleClose}>
              {closeArmed ? 'Descartar?' : 'Fechar'}
            </button>
            <button
              type="button"
              className="primary-button prompt-editor__action prompt-editor__action--primary"
              disabled={!props.isDirty || props.status === 'loading' || props.status === 'saving'}
              onClick={props.onSave}
            >
              {props.status === 'saving' ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>

        <div className="prompt-editor__workspace workspace-file-editor__workspace">
          <div ref={editorRootRef} className="prompt-editor__editor workspace-file-editor__editor" />

          {props.status === 'loading' ? (
            <div className="workspace-file-editor__overlay">
              <p>Abrindo arquivo remoto...</p>
            </div>
          ) : null}

          {props.status === 'error' && props.errorMessage ? (
            <div className="workspace-file-editor__overlay workspace-file-editor__overlay--error">
              <p>{props.errorMessage}</p>
            </div>
          ) : null}
        </div>

        <div className="prompt-editor__footer workspace-file-editor__footer">
          {props.autocompletePreview ? (
            <div className="prompt-editor__suggestion" aria-live="polite">
              <span>Copilot</span>
              <p>{props.autocompletePreview}</p>
            </div>
          ) : null}

          <div className="prompt-editor__toolbar">
            <div className="prompt-editor__toolbar-group">
              <button type="button" className="ghost-button prompt-editor__chip" onClick={handleInsertTab}>
                Tab
              </button>
              {props.autocompletePreview ? (
                <button type="button" className="ghost-button prompt-editor__chip" onClick={props.onAcceptAutocomplete}>
                  Aceitar
                </button>
              ) : null}
            </div>

            <div className="prompt-editor__toolbar-group prompt-editor__toolbar-group--end">
              {props.autocompleteStatus === 'loading' ? <span className="prompt-editor__status">Copilot pensando</span> : null}
              {props.autocompleteMessage ? <span className="prompt-editor__status">{props.autocompleteMessage}</span> : null}
              {props.errorMessage ? <span className="prompt-editor__status">{props.errorMessage}</span> : null}
              {props.saveMessage ? <span className="prompt-editor__status">{props.saveMessage}</span> : null}
              {props.autocompleteMessage ? (
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