import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputBar } from '../src/components/InputBar';

interface HarnessProps {
  rawMode?: boolean;
  disabled?: boolean;
  initialValue?: string;
  onSend?: () => void;
}

function InputBarHarness({
  rawMode = false,
  disabled = false,
  initialValue = '',
  onSend = vi.fn(),
}: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialValue.length);

  return (
    <InputBar
      value={value}
      cursor={cursor}
      rawMode={rawMode}
      disabled={disabled}
      onChange={(nextValue, nextCursor) => {
        setValue(nextValue);
        setCursor(nextCursor);
      }}
      onCursorChange={setCursor}
      onSend={onSend}
      onToggleCommands={() => undefined}
      onToggleRawMode={() => undefined}
    />
  );
}

afterEach(() => {
  cleanup();
});

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
});