import { cleanup, render, screen } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useOutputHistory } from '../src/hooks/useOutputHistory';
import type { OutputHistoryItem } from '../src/lib/terminalOutput';

interface OutputHistoryHarnessProps {
  resetSignal: string;
  nextItems?: OutputHistoryItem[];
}

function OutputHistoryHarness({ resetSignal, nextItems = [] }: OutputHistoryHarnessProps) {
  const { items, replaceItems } = useOutputHistory({ resetSignal });

  useEffect(() => {
    replaceItems(nextItems);
  }, [nextItems, replaceItems]);

  return <pre data-testid="history">{JSON.stringify(items.map((item) => item.displayText))}</pre>;
}

afterEach(() => {
  cleanup();
});

describe('useOutputHistory', () => {
  it('replaces history items with the latest terminal snapshot', () => {
    render(
      <OutputHistoryHarness
        resetSignal="session-a"
        nextItems={[
          {
            id: 'terminal-1',
            source: 'terminal',
            rawText: 'linha 1',
            displayText: 'linha 1',
            createdAt: 1,
            order: 1,
          },
          {
            id: 'terminal-2',
            source: 'terminal',
            rawText: 'linha 2',
            displayText: 'linha 2',
            createdAt: 1,
            order: 2,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('history')).toHaveTextContent(JSON.stringify(['linha 1', 'linha 2']));
  });

  it('clears history when the reset signal changes', () => {
    const { rerender } = render(
      <OutputHistoryHarness
        resetSignal="session-c"
        nextItems={[
          {
            id: 'terminal-1',
            source: 'terminal',
            rawText: 'to-clear',
            displayText: 'to-clear',
            createdAt: 1,
            order: 1,
          },
        ]}
      />,
    );

    expect(screen.getByTestId('history')).toHaveTextContent(JSON.stringify(['to-clear']));

    rerender(
      <OutputHistoryHarness
        resetSignal="session-d"
      />,
    );

    expect(screen.getByTestId('history')).toHaveTextContent(JSON.stringify([]));
  });
});