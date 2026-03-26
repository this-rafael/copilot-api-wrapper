import { useCallback, useRef, useState } from 'react';
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { shouldRequestPromptAutocomplete, usePromptAutocomplete } from '../src/hooks/usePromptAutocomplete';
import type {
  AutocompleteResultsMessage,
  AutocompleteStatusMessage,
} from '../src/lib/protocol';

interface HarnessProps {
  initialValue: string;
  initialCursor?: number;
  requestAutocomplete?: (
    requestId: number,
    text: string,
    cursor: number,
    languageId?: string,
    tabSize?: number,
    insertSpaces?: boolean,
  ) => void;
}

function PromptAutocompleteHarness({
  initialValue,
  initialCursor = initialValue.length,
  requestAutocomplete = vi.fn(),
}: HarnessProps) {
  const [value, setValue] = useState(initialValue);
  const [cursor, setCursor] = useState(initialCursor);
  const resultsListenerRef = useRef<((message: AutocompleteResultsMessage) => void) | null>(null);
  const statusListenerRef = useRef<((message: AutocompleteStatusMessage) => void) | null>(null);

  const addAutocompleteResultsListener = useCallback((listener: (message: AutocompleteResultsMessage) => void) => {
    resultsListenerRef.current = listener;
    return () => {
      resultsListenerRef.current = null;
    };
  }, []);

  const addAutocompleteStatusListener = useCallback((listener: (message: AutocompleteStatusMessage) => void) => {
    statusListenerRef.current = listener;
    return () => {
      statusListenerRef.current = null;
    };
  }, []);

  const autocomplete = usePromptAutocomplete({
    value,
    cursor,
    rawMode: false,
    disabled: false,
    sessionStatus: 'active',
    requestAutocomplete,
    acceptAutocomplete: vi.fn(),
    addAutocompleteResultsListener,
    addAutocompleteStatusListener,
  });

  return (
    <>
      <div data-testid="status">{autocomplete.status}</div>
      <button type="button" onClick={() => setValue('quero uma sugestao auto')}>
        set-eligible
      </button>
      <button type="button" onClick={() => setValue('quero uma sugestao ')}>
        set-trailing-space
      </button>
      <button type="button" onClick={() => setValue('quero uma sug') }>
        set-short-token
      </button>
      <button type="button" onClick={() => setCursor(5)}>
        move-cursor
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('shouldRequestPromptAutocomplete', () => {
  it('only allows autocomplete when the prompt is long enough and ends with a meaningful token', () => {
    expect(shouldRequestPromptAutocomplete('curto', 5)).toBe(false);
    expect(shouldRequestPromptAutocomplete('quero uma sugestao ', 'quero uma sugestao '.length)).toBe(false);
    expect(shouldRequestPromptAutocomplete('quero uma sug', 'quero uma sug'.length)).toBe(false);
    expect(shouldRequestPromptAutocomplete('quero uma sugestao auto', 'quero uma sugestao auto'.length)).toBe(true);
  });

  it('does not allow autocomplete when the cursor is not at the end', () => {
    expect(shouldRequestPromptAutocomplete('quero uma sugestao auto', 5)).toBe(false);
  });
});

describe('usePromptAutocomplete', () => {
  it('waits longer before requesting autocomplete and skips ineligible states', () => {
    vi.useFakeTimers();
    const requestAutocomplete = vi.fn();

    render(
      <PromptAutocompleteHarness
        initialValue="quero uma sugestao auto"
        requestAutocomplete={requestAutocomplete}
      />,
    );

    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    act(() => {
      vi.advanceTimersByTime(649);
    });

    expect(requestAutocomplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });

    expect(requestAutocomplete).toHaveBeenCalledWith(1, 'quero uma sugestao auto', 23, 'markdown', 2, true);
  });

  it('does not request autocomplete for trailing spaces, short trailing tokens, or mid-text cursors', () => {
    vi.useFakeTimers();
    const requestAutocomplete = vi.fn();

    render(
      <PromptAutocompleteHarness
        initialValue="quero uma sugestao "
        requestAutocomplete={requestAutocomplete}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1000);
    });

    expect(requestAutocomplete).not.toHaveBeenCalled();
    expect(screen.getByTestId('status')).toHaveTextContent('idle');

    act(() => {
      screen.getByRole('button', { name: 'set-short-token' }).click();
      vi.advanceTimersByTime(1000);
    });

    expect(requestAutocomplete).not.toHaveBeenCalled();

    act(() => {
      screen.getByRole('button', { name: 'set-eligible' }).click();
      screen.getByRole('button', { name: 'move-cursor' }).click();
      vi.advanceTimersByTime(1000);
    });

    expect(requestAutocomplete).not.toHaveBeenCalled();
  });
});