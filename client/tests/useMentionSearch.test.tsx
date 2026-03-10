import { useCallback, useRef, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MentionSearchSheet } from '../src/components/MentionSearchSheet';
import { useMentionSearch } from '../src/hooks/useMentionSearch';
import type { ContextSearchResultsMessage } from '../src/lib/protocol';

function createResultsMessage(query: string, items?: ContextSearchResultsMessage['items']): ContextSearchResultsMessage {
  return {
    type: 'context.search.results',
    sessionId: 'session-1',
    mentionType: 'file',
    query,
    items: items ?? [
      {
        id: 'sum-js',
        kind: 'file',
        label: 'sum.js',
        path: 'src/sum.js',
        description: 'src/sum.js',
      },
    ],
  };
}

interface MentionSearchHarnessProps {
  searchContext?: (mentionType: 'file' | 'folder' | 'workspace', query: string, limit?: number) => void;
}

const noopSearchContext = vi.fn();

function MentionSearchHarness({ searchContext = noopSearchContext }: MentionSearchHarnessProps) {
  const [value, setValue] = useState('@file sum');
  const messageListenerRef = useRef<((message: ContextSearchResultsMessage) => void) | null>(null);

  const addSearchResultsListener = useCallback((listener: (message: ContextSearchResultsMessage) => void) => {
    messageListenerRef.current = listener;
    return () => {
      messageListenerRef.current = null;
    };
  }, []);

  const mentionSearch = useMentionSearch({
    value,
    cursor: value.length,
    sessionStatus: 'active',
    searchContext,
    addSearchResultsListener,
  });

  return (
    <>
      <div data-testid="open-state">{mentionSearch.isOpen ? 'open' : 'closed'}</div>
      <div data-testid="status-state">{mentionSearch.status}</div>
      <div data-testid="query-state">{mentionSearch.query}</div>
      <button type="button" onClick={() => mentionSearch.close()}>
        close-sheet
      </button>
      <button type="button" onClick={() => setValue('@file sumj')}>
        change-query
      </button>
      <button
        type="button"
        onClick={() => messageListenerRef.current?.(createResultsMessage(value.replace('@file', '').trim()))}
      >
        emit-results
      </button>
      <button
        type="button"
        onClick={() => messageListenerRef.current?.(createResultsMessage(value.replace('@file', '').trim(), []))}
      >
        emit-empty-results
      </button>
      <MentionSearchSheet
        open={mentionSearch.isOpen}
        items={mentionSearch.items}
        status={mentionSearch.status}
        query={mentionSearch.query}
        onQueryChange={mentionSearch.setQuery}
        onSelect={() => undefined}
        onClose={mentionSearch.close}
      />
    </>
  );
}

function MentionSearchSheetHarness() {
  const [query, setQuery] = useState('');

  return (
    <>
      <div data-testid="sheet-query">{query}</div>
      <MentionSearchSheet
        open
        items={[
          {
            id: 'sum-js',
            kind: 'file',
            label: 'sum.js',
            path: 'src/sum.js',
            description: 'src/sum.js',
          },
        ]}
        status="ready"
        query={query}
        onQueryChange={setQuery}
        onSelect={() => undefined}
        onClose={() => undefined}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('mention search interactions', () => {
  it('keeps the sheet closed after manual close until the mention changes', async () => {
    const user = userEvent.setup();

    render(<MentionSearchHarness />);

    await user.click(screen.getByRole('button', { name: 'emit-results' }));
    expect(screen.getByTestId('open-state')).toHaveTextContent('open');

    await user.click(screen.getByRole('button', { name: 'close-sheet' }));
    expect(screen.getByTestId('open-state')).toHaveTextContent('closed');

    await user.click(screen.getByRole('button', { name: 'emit-results' }));
    expect(screen.getByTestId('open-state')).toHaveTextContent('closed');

    await user.click(screen.getByRole('button', { name: 'change-query' }));
    await user.click(screen.getByRole('button', { name: 'emit-results' }));
    expect(screen.getByTestId('open-state')).toHaveTextContent('open');
  });

  it('queries the backend again when the popup search changes', async () => {
    vi.useFakeTimers();
    const searchContext = vi.fn();

    render(<MentionSearchHarness searchContext={searchContext} />);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(searchContext).toHaveBeenLastCalledWith('file', 'sum', 20);
    expect(screen.getByTestId('status-state')).toHaveTextContent('loading');

  fireEvent.click(screen.getByRole('button', { name: 'emit-results' }));
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'server' } });

    expect(screen.getByTestId('query-state')).toHaveTextContent('server');

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(searchContext).toHaveBeenLastCalledWith('file', 'server', 20);
  });

  it('keeps the mention sheet open to show an empty state when the query has no matches', async () => {
    const user = userEvent.setup();

    render(<MentionSearchHarness />);

    await user.click(screen.getByRole('button', { name: 'emit-results' }));
    await waitFor(() => {
      expect(screen.getByTestId('status-state')).toHaveTextContent('ready');
    });

    await user.click(screen.getByRole('button', { name: 'emit-empty-results' }));
    await waitFor(() => {
      expect(screen.getByTestId('status-state')).toHaveTextContent('ready');
    });

    expect(screen.getByTestId('open-state')).toHaveTextContent('open');
    expect(screen.getByText('Nenhum resultado encontrado.')).toBeInTheDocument();
  });

  it('keeps the popup search field controlled by the caller', async () => {
    const user = userEvent.setup();

    render(<MentionSearchSheetHarness />);

    await user.type(screen.getByRole('searchbox'), 'sum');

    expect(screen.getByTestId('sheet-query')).toHaveTextContent('sum');
  });
});