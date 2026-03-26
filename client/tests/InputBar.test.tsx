import { useState } from 'react';
import { EditorSelection } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputBar } from '../src/components/InputBar';

interface HarnessProps {
  rawMode?: boolean;
  disabled?: boolean;
  initialValue?: string;
  onSend?: () => void;
  onToggleCopilotResources?: () => void;
  autocompleteStatus?: 'idle' | 'loading' | 'ready' | 'error';
  autocompletePreview?: string | null;
  autocompleteMessage?: string | null;
  onAcceptAutocomplete?: () => void;
  onDismissAutocomplete?: () => void;
}

function InputBarHarness({
  rawMode = false,
  disabled = false,
  initialValue = '',
  onSend = vi.fn(),
  onToggleCopilotResources = vi.fn(),
  autocompleteStatus = 'idle',
  autocompletePreview = null,
  autocompleteMessage = null,
  onAcceptAutocomplete = vi.fn(),
  onDismissAutocomplete = vi.fn(),
}: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  return (
    <InputBar
      value={value}
      cursor={cursor}
      rawMode={rawMode}
      disabled={disabled}
      autocompleteStatus={autocompleteStatus}
      autocompletePreview={autocompletePreview}
      autocompleteMessage={autocompleteMessage}
      onChange={(nextValue, nextCursor) => {
        setValue(nextValue);
        setCursor(nextCursor);
      }}
      onCursorChange={setCursor}
      onSend={onSend}
      onAcceptAutocomplete={onAcceptAutocomplete}
      onDismissAutocomplete={onDismissAutocomplete}
      onToggleCommands={() => undefined}
      onToggleCopilotResources={onToggleCopilotResources}
      onToggleRawMode={() => undefined}
    />
  );
}

afterEach(() => {
  cleanup();
});

function getFullscreenEditorView(dialog: HTMLElement): EditorView {
  const editorElement = dialog.querySelector('.cm-editor');
  if (!(editorElement instanceof HTMLElement)) {
    throw new Error('CodeMirror editor element not found');
  }

  const view = EditorView.findFromDOM(editorElement);
  if (!view) {
    throw new Error('CodeMirror editor view not found');
  }

  return view;
}

describe('InputBar', () => {
  it('inserts a local line break on Enter in normal mode', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<InputBarHarness onSend={onSend} />);

    const field = screen.getByRole('textbox');
    await user.type(field, 'hello{Enter}world');

    expect(field).toHaveValue('hello\nworld');
    expect(onSend).not.toHaveBeenCalled();
  });

  it('submits on Ctrl+Enter in normal mode', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<InputBarHarness initialValue="hello" onSend={onSend} />);

    const field = screen.getByRole('textbox');
    await user.click(field);
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(field).toHaveValue('hello');
  });

  it('adds a line break with the dedicated button', async () => {
    const user = userEvent.setup();

    render(<InputBarHarness initialValue="helloX" />);

    const field = screen.getByRole('textbox') as HTMLTextAreaElement;
    field.focus();
    field.setSelectionRange(5, 5);

    await user.click(screen.getByRole('button', { name: 'Linha' }));

    expect(field).toHaveValue('hello\nX');
  });

  it('uses Enter as submit in raw mode', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<InputBarHarness rawMode initialValue="hello" onSend={onSend} />);

    const field = screen.getByRole('textbox');
    await user.click(field);
    await user.keyboard('{Enter}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(field).toHaveValue('hello');
  });

  it('opens a fullscreen editor and keeps the prompt synchronized', async () => {
    const user = userEvent.setup();

    render(<InputBarHarness initialValue="hello" />);

    await user.click(screen.getByRole('button', { name: 'Tela cheia' }));

    const dialog = screen.getByRole('dialog', { name: 'Editor do prompt' });
    within(dialog).getByRole('textbox', { name: 'Editor do prompt em tela cheia' });
    const editorView = getFullscreenEditorView(dialog as HTMLElement);

    expect(document.body.classList.contains('prompt-editor-open')).toBe(true);

    act(() => {
      editorView.dispatch({
        changes: {
          from: editorView.state.doc.length,
          insert: ' world',
        },
        selection: EditorSelection.cursor(editorView.state.doc.length + ' world'.length),
      });
    });

    await user.click(within(dialog).getByRole('button', { name: 'Fechar' }));

    expect(screen.getByRole('textbox')).toHaveValue('hello world');
    expect(document.body.classList.contains('prompt-editor-open')).toBe(false);
  });

  it('submits from the fullscreen editor with Ctrl+Enter', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<InputBarHarness initialValue="hello" onSend={onSend} />);

    await user.click(screen.getByRole('button', { name: 'Tela cheia' }));

    const dialog = screen.getByRole('dialog', { name: 'Editor do prompt' });
    const fullscreenField = within(dialog).getByRole('textbox', { name: 'Editor do prompt em tela cheia' });

    await user.click(fullscreenField);
    await user.keyboard('{Control>}{Enter}{/Control}');

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'Editor do prompt' })).not.toBeInTheDocument();
  });

  it('accepts autocomplete with Tab when a suggestion is visible', async () => {
    const user = userEvent.setup();
    const onAcceptAutocomplete = vi.fn();

    render(
      <InputBarHarness
        initialValue="hello"
        autocompleteStatus="ready"
        autocompletePreview=" world"
        onAcceptAutocomplete={onAcceptAutocomplete}
      />,
    );

    const field = screen.getByRole('textbox');
    await user.click(field);
    await user.keyboard('{Tab}');

    expect(onAcceptAutocomplete).toHaveBeenCalledTimes(1);
  });

  it('opens the Copilot resources picker from the dedicated button', async () => {
    const user = userEvent.setup();
    const onToggleCopilotResources = vi.fn();

    render(<InputBarHarness onToggleCopilotResources={onToggleCopilotResources} />);

    await user.click(screen.getByRole('button', { name: 'Copilot' }));

    expect(onToggleCopilotResources).toHaveBeenCalledTimes(1);
  });
});
