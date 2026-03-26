import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useCopilotResourceCatalog } from '../src/hooks/useCopilotResourceCatalog';
import type { ClientMessage, ServerMessage } from '../src/lib/protocol';

interface HarnessProps {
  addMessageListener: (listener: (message: ServerMessage) => void) => () => void;
  sendMessage?: (message: ClientMessage) => void;
}

function CopilotResourceCatalogHarness({ addMessageListener, sendMessage = vi.fn() }: HarnessProps) {
  const catalog = useCopilotResourceCatalog({
    socketStatus: 'open',
    addMessageListener,
    sendMessage,
  });

  return (
    <>
      <div data-testid="status">{catalog.status}</div>
      <div data-testid="count">{catalog.items.length}</div>
      <div data-testid="skill-count">{catalog.groups.skills.length}</div>
      <div data-testid="prompt-count">{catalog.groups.prompts.length}</div>
      <div data-testid="mcp-count">{catalog.groups.mcp.length}</div>
      <div data-testid="error">{catalog.errorMessage ?? ''}</div>
      <button type="button" onClick={() => catalog.requestResources()}>
        request
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

describe('useCopilotResourceCatalog', () => {
  it('requests resources and stores grouped results', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;
    const sendMessage = vi.fn();

    render(
      <CopilotResourceCatalogHarness
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

    expect(sendMessage).toHaveBeenCalledWith({ type: 'copilot.resources.list' });
    expect(screen.getByTestId('status')).toHaveTextContent('loading');

    act(() => {
      messageListener?.({
        type: 'copilot.resources.list.results',
        items: [
          {
            id: 'skill:review',
            kind: 'skill',
            scope: 'workspace',
            label: 'review-flow',
            description: 'Faz revisoes',
            invocation: '/review-flow ',
            sourcePath: '/srv/repo/.github/skills/review-flow/SKILL.md',
            originLabel: 'repo',
          },
          {
            id: 'prompt:fix',
            kind: 'prompt',
            scope: 'local',
            label: 'fix-bug',
            description: 'Corrige bugs',
            invocation: '/fix-bug ',
            sourcePath: '/home/user/.copilot/prompts/fix-bug.prompt.md',
            originLabel: 'Pessoal',
          },
          {
            id: 'mcp:github',
            kind: 'mcp',
            scope: 'local',
            label: 'github',
            description: 'Servidor MCP',
            invocation: '/mcp show github',
            sourcePath: '/home/user/.copilot/mcp.json',
            originLabel: 'Pessoal',
          },
        ],
      });
    });

    expect(screen.getByTestId('status')).toHaveTextContent('ready');
    expect(screen.getByTestId('count')).toHaveTextContent('3');
    expect(screen.getByTestId('skill-count')).toHaveTextContent('1');
    expect(screen.getByTestId('prompt-count')).toHaveTextContent('1');
    expect(screen.getByTestId('mcp-count')).toHaveTextContent('1');
  });

  it('stores resource loading errors and can reset state', () => {
    let messageListener: ((message: ServerMessage) => void) | null = null;

    render(
      <CopilotResourceCatalogHarness
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
        type: 'session.error',
        code: 'COPILOT_RESOURCES_LIST_FAILED',
        message: 'Falha ao ler recursos',
      });
    });

    expect(screen.getByTestId('status')).toHaveTextContent('error');
    expect(screen.getByTestId('error')).toHaveTextContent('Falha ao ler recursos');

    act(() => {
      screen.getByRole('button', { name: 'reset' }).click();
    });

    expect(screen.getByTestId('status')).toHaveTextContent('idle');
    expect(screen.getByTestId('count')).toHaveTextContent('0');
  });
});