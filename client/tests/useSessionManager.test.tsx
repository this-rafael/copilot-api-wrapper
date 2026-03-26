import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSessionManager } from '../src/hooks/useSessionManager';
import type { ClientMessage, ServerMessage } from '../src/lib/protocol';

interface HarnessProps {
  socketStatus?: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  sendMessage?: (message: ClientMessage) => void;
}

function SessionManagerHarness({
  socketStatus = 'open',
  addMessageListener,
  sendMessage = vi.fn(),
}: HarnessProps) {
  const manager = useSessionManager({
    socketStatus,
    addMessageListener,
    sendMessage,
  });

  const sessionA = manager.sessions.find((session) => session.tabId === 'tab-a');
  const sessionB = manager.sessions.find((session) => session.tabId === 'tab-b');

  return (
    <>
      <div data-testid="status-a">{sessionA?.status ?? 'missing'}</div>
      <div data-testid="status-b">{sessionB?.status ?? 'missing'}</div>
      <div data-testid="output-a">{sessionA?.output ?? ''}</div>
      <div data-testid="output-b">{sessionB?.output ?? ''}</div>
      <button
        type="button"
        onClick={() => manager.createSession({ tabId: 'tab-a', cwd: '/workspace/a', commandProfile: 'copilot-interactive' })}
      >
        create-a
      </button>
      <button
        type="button"
        onClick={() => manager.createSession({ tabId: 'tab-b', cwd: '/workspace/b', commandProfile: 'copilot-interactive' })}
      >
        create-b
      </button>
      <button
        type="button"
        onClick={() => manager.requestAutocomplete('tab-b', 7, 'hello world', 11, 'markdown')}
      >
        autocomplete-b
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

describe('useSessionManager', () => {
  it('routes session readiness and terminal output per tab', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <SessionManagerHarness
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'create-a' }).click();
      screen.getByRole('button', { name: 'create-b' }).click();
    });

    expect(screen.getByTestId('status-a')).toHaveTextContent('creating');
    expect(screen.getByTestId('status-b')).toHaveTextContent('creating');

    act(() => {
      messageListener?.({ type: 'session.ready', sessionId: 'session-a' });
      messageListener?.({ type: 'session.ready', sessionId: 'session-b' });
      messageListener?.({ type: 'terminal.output', sessionId: 'session-a', data: 'READY\n' });
      messageListener?.({ type: 'terminal.output', sessionId: 'session-b', data: 'READY\n' });
      messageListener?.({ type: 'terminal.output', sessionId: 'session-a', data: 'alpha\n' });
      messageListener?.({ type: 'terminal.output', sessionId: 'session-b', data: 'beta\n' });
    });

    expect(screen.getByTestId('status-a')).toHaveTextContent('active');
    expect(screen.getByTestId('status-b')).toHaveTextContent('active');
    expect(screen.getByTestId('output-a')).toHaveTextContent('READY alpha');
    expect(screen.getByTestId('output-b')).toHaveTextContent('READY beta');
  });

  it('sends tab-scoped autocomplete requests using the mapped session id', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;
    const sendMessage = vi.fn();

    render(
      <SessionManagerHarness
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
      screen.getByRole('button', { name: 'create-b' }).click();
      messageListener?.({ type: 'session.ready', sessionId: 'session-b' });
      messageListener?.({ type: 'terminal.output', sessionId: 'session-b', data: 'READY\n' });
      screen.getByRole('button', { name: 'autocomplete-b' }).click();
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'autocomplete.request',
      sessionId: 'session-b',
      requestId: 7,
      text: 'hello world',
      cursor: 11,
      languageId: 'markdown',
      tabSize: 2,
      insertSpaces: true,
    });
  });
});