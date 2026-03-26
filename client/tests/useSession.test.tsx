import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSession, type SessionStatus } from '../src/hooks/useSession';
import type { ClientMessage, ServerMessage } from '../src/lib/protocol';

interface HarnessProps {
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  sendMessage?: (message: ClientMessage) => void;
}

function SessionHarness({ addMessageListener, sendMessage = vi.fn() }: HarnessProps) {
  const session = useSession({
    socketStatus: 'open',
    addMessageListener,
    sendMessage,
  });

  return (
    <>
      <div data-testid="status">{session.status}</div>
      <button
        type="button"
        onClick={() =>
          session.createSession({
            cwd: '/tmp',
            commandProfile: 'copilot-interactive',
            cols: 80,
            rows: 24,
          })
        }
      >
        create
      </button>
      <button type="button" onClick={() => session.resetSession()}>
        reset
      </button>
      <button
        type="button"
        onClick={() => session.requestAutocomplete(7, 'hello', 5, 'markdown')}
      >
        autocomplete-request
      </button>
      <button
        type="button"
        onClick={() => session.acceptAutocomplete('suggestion-1')}
      >
        autocomplete-accept
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
});

function expectStatus(status: SessionStatus) {
  expect(screen.getByTestId('status')).toHaveTextContent(status);
}

describe('useSession readiness', () => {
  it('keeps the session in creating until a ready prompt is observed', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <SessionHarness
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'create' }).click();
    });
    expectStatus('creating');

    act(() => {
      messageListener?.({ type: 'session.ready', sessionId: 'session-1' });
    });
    expectStatus('creating');

    act(() => {
      messageListener?.({
        type: 'terminal.output',
        sessionId: 'session-1',
        data: 'loading environment...',
      });
    });
    expectStatus('creating');

    act(() => {
      messageListener?.({
        type: 'terminal.output',
        sessionId: 'session-1',
        data: '\u001b[37m❯ \u001b[39mType @ to mention files',
      });
    });
    expectStatus('active');
  });

  it('treats READY output from the fake terminal as ready', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <SessionHarness
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'create' }).click();
      messageListener?.({ type: 'session.ready', sessionId: 'session-2' });
      messageListener?.({
        type: 'terminal.output',
        sessionId: 'session-2',
        data: 'READY\r\n',
      });
    });

    expectStatus('active');
  });

  it('returns to idle when the session is reset', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <SessionHarness
        addMessageListener={(listener) => {
          messageListener = listener;
          return () => {
            messageListener = null;
          };
        }}
      />,
    );

    act(() => {
      screen.getByRole('button', { name: 'create' }).click();
      messageListener?.({ type: 'session.ready', sessionId: 'session-3' });
      messageListener?.({
        type: 'terminal.output',
        sessionId: 'session-3',
        data: 'READY\r\n',
      });
    });

    expectStatus('active');

    act(() => {
      screen.getByRole('button', { name: 'reset' }).click();
    });

    expectStatus('idle');
  });

  it('sends autocomplete messages for the active session', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;
    const sendMessage = vi.fn();

    render(
      <SessionHarness
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
      screen.getByRole('button', { name: 'create' }).click();
      messageListener?.({ type: 'session.ready', sessionId: 'session-4' });
      messageListener?.({
        type: 'terminal.output',
        sessionId: 'session-4',
        data: 'READY\r\n',
      });
    });

    act(() => {
      screen.getByRole('button', { name: 'autocomplete-request' }).click();
      screen.getByRole('button', { name: 'autocomplete-accept' }).click();
    });

    expect(sendMessage).toHaveBeenCalledWith({
      type: 'autocomplete.request',
      sessionId: 'session-4',
      requestId: 7,
      text: 'hello',
      cursor: 5,
      languageId: 'markdown',
      tabSize: 2,
      insertSpaces: true,
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'autocomplete.accept',
      sessionId: 'session-4',
      suggestionId: 'suggestion-1',
    });
  });
});
