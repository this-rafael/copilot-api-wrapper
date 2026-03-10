import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as clipboard from '../src/lib/clipboard';
import { CopyOutputSheet } from '../src/components/CopyOutputSheet';
import type { OutputHistoryItem } from '../src/lib/terminalOutput';

const baseItems: OutputHistoryItem[] = [
  {
    id: 'terminal-1',
    source: 'terminal',
    rawText: 'primeira linha',
    displayText: 'primeira linha',
    createdAt: 1,
    order: 1,
  },
  {
    id: 'terminal-2',
    source: 'terminal',
    rawText: 'resultado filtravel',
    displayText: 'resultado filtravel',
    createdAt: 2,
    order: 2,
  },
];

afterEach(() => {
  cleanup();
});

describe('CopyOutputSheet', () => {
  const copyTextToClipboard = vi.spyOn(clipboard, 'copyTextToClipboard');

  beforeEach(() => {
    copyTextToClipboard.mockReset();
    copyTextToClipboard.mockResolvedValue();
  });

  it('filters items by the search term and copies the selected line', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCopySuccess = vi.fn();
    const onCopyError = vi.fn();

    render(
      <CopyOutputSheet
        open
        items={baseItems}
        onClose={onClose}
        onCopySuccess={onCopySuccess}
        onCopyError={onCopyError}
      />, 
    );

    await user.type(screen.getByRole('searchbox'), 'filtra');

    expect(screen.queryByRole('button', { name: /primeira linha/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /resultado filtravel/i }));

    await waitFor(() => {
      expect(copyTextToClipboard).toHaveBeenCalledWith('resultado filtravel');
      expect(onCopySuccess).toHaveBeenCalledWith(baseItems[1]);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onCopyError).not.toHaveBeenCalled();
    });
  });

  it('shows the empty-state message when no lines match the term', async () => {
    const user = userEvent.setup();

    render(
      <CopyOutputSheet
        open
        items={baseItems}
        onClose={() => undefined}
        onCopySuccess={() => undefined}
        onCopyError={() => undefined}
      />, 
    );

    await user.type(screen.getByRole('searchbox'), 'nao existe');

    expect(screen.getByText('Nenhuma linha contem esse termo.')).toBeInTheDocument();
  });
});