import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceCatalog } from '../src/hooks/useWorkspaceCatalog';
import type { ClientMessage, ServerMessage } from '../src/lib/protocol';

interface HarnessProps {
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  sendMessage?: (message: ClientMessage) => void;
}

function WorkspaceCatalogHarness({ addMessageListener, sendMessage = vi.fn() }: HarnessProps) {
  const catalog = useWorkspaceCatalog({
    socketStatus: 'open',
    addMessageListener,
    sendMessage,
  });

  return (
    <>
      <div data-testid="status">{catalog.status}</div>
      <div data-testid="count">{catalog.workspaces.length}</div>
      <div data-testid="error">{catalog.errorMessage ?? ''}</div>
      <div data-testid="pending-action">{catalog.pendingAction ?? ''}</div>
      <button type="button" onClick={() => catalog.requestWorkspaces()}>
        request
      </button>
      <button type="button" onClick={() => catalog.addCustomWorkspace('/home/user/repo-c')}>
        add
      </button>
      <button type="button" onClick={() => catalog.discoverGitWorkspaces()}>
        discover
      </button>
      <button type="button" onClick={() => catalog.reset()}>
        reset
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('useWorkspaceCatalog', () => {
  it('requests workspaces and stores the response', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;
    const sendMessage = vi.fn();

    render(
      <WorkspaceCatalogHarness
        sendMessage={sendMessage}
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'request' }).click();
    });

    expect(sendMessage).toHaveBeenCalledWith({ type: 'workspace.list' });
    expect(screen.getByTestId('status')).toHaveTextContent('loading');
    expect(screen.getByTestId('pending-action')).toHaveTextContent('list');

    act(() => {
      messageListener?.({
        type: 'workspace.list.results',
        workspaces: [
          { name: 'repo-a', path: '/home/user/repo-a' },
          { name: 'repo-b', path: '/home/user/repo-b' },
        ],
      });
    });

    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('count')).toHaveTextContent('2');
    expect(screen.getByTestId('pending-action')).toHaveTextContent('');
  });

  it('resets the catalog state', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <WorkspaceCatalogHarness
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'request' }).click();
      messageListener?.({
        type: 'workspace.list.results',
        workspaces: [{ name: 'repo-a', path: '/home/user/repo-a' }],
      });
    });

    expect(screen.getByTestId('count')).toHaveTextContent('1');

    act(() => {
      screen.getByRole('button', { name: 'reset' }).click();
    });

    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });

  it('sends the custom workspace request', () => {
    const sendMessage = vi.fn();

    render(
      <WorkspaceCatalogHarness
        sendMessage={sendMessage}
        addMessageListener={() => () => {}}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'add' }).click();
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'workspace.addCustom',
      path: '/home/user/repo-c',
    });
  });

  it('sends the Git discovery request', () => {
    const sendMessage = vi.fn();

    render(
      <WorkspaceCatalogHarness
        sendMessage={sendMessage}
        addMessageListener={() => () => {}}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'discover' }).click();
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'workspace.discoverGit',
    });
    expect(screen.getByTestId('pending-action')).toHaveTextContent('discoverGit');
  });
});
