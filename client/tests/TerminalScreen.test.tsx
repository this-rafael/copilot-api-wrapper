import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalScreen } from '../src/components/TerminalScreen';
import { themeDefinitions } from '../src/lib/themes';

let fullscreenElement: Element | null = null;
let orientationLockMock: ReturnType<typeof vi.fn>;
let orientationUnlockMock: ReturnType<typeof vi.fn>;

function buildProps(overrides: Partial<React.ComponentProps<typeof TerminalScreen>> = {}) {
  return {
    terminal: {
      containerRef: () => undefined,
    },
    theme: themeDefinitions.dracula,
    socketStatus: 'open' as const,
    sessionStatus: 'active' as const,
    sessionError: null,
    outputHistoryItems: [],
    outputHistoryHasContent: false,
    mentionQuery: '',
    mentionStatus: 'idle' as const,
    inputValue: '',
    inputCursor: 0,
    rawMode: false,
    autocompleteStatus: 'idle' as const,
    autocompletePreview: null,
    autocompleteMessage: null,
    mentionItems: [],
    mentionOpen: false,
    onMentionQueryChange: vi.fn(),
    onInputChange: vi.fn(),
    onInputCursorChange: vi.fn(),
    onSend: vi.fn(),
    onAcceptAutocomplete: vi.fn(),
    onDismissAutocomplete: vi.fn(),
    onQuickAction: vi.fn(),
    onOpenFiles: vi.fn(),
    onToggleCommands: vi.fn(),
    onToggleRawMode: vi.fn(),
    onCloseSession: vi.fn(),
    onToggleTheme: vi.fn(),
    commandPickerOpen: false,
    onCloseCommandPicker: vi.fn(),
    onSelectCommand: vi.fn(),
    onCloseMentionSheet: vi.fn(),
    onSelectMentionItem: vi.fn(),
    fontSize: 14,
    outputOrientation: 'landscape' as const,
    onToggleOutputOrientation: vi.fn(),
    onIncreaseFont: vi.fn(),
    onDecreaseFont: vi.fn(),
    onFullscreenChange: vi.fn(),
    onTerminalViewportChange: vi.fn(),
    sessionTabs: [
      {
        id: 'session-a',
        label: 'repo-a',
        path: '/workspace/repo-a',
        status: 'active' as const,
        active: true,
        hasDraft: false,
      },
    ],
    onSelectSession: vi.fn(),
    onCreateSession: vi.fn(),
    onCloseSessionTab: vi.fn(),
    ...overrides,
  };
}

async function openToolbarMenu(user: ReturnType<typeof userEvent.setup>) {
  const trigger = screen.getByRole('button', { name: 'Ferramentas do terminal' });

  if (trigger.getAttribute('aria-expanded') !== 'true') {
    await user.click(trigger);
  }
}

beforeEach(() => {
  fullscreenElement = null;
  orientationLockMock = vi.fn().mockResolvedValue(undefined);
  orientationUnlockMock = vi.fn();

  Object.defineProperty(document, 'fullscreenElement', {
    configurable: true,
    get: () => fullscreenElement,
  });

  Object.defineProperty(document, 'fullscreenEnabled', {
    configurable: true,
    value: true,
  });

  Object.defineProperty(document, 'exitFullscreen', {
    configurable: true,
    value: vi.fn(async () => {
      fullscreenElement = null;
      document.dispatchEvent(new Event('fullscreenchange'));
    }),
  });

  Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
    configurable: true,
    value: vi.fn(async function requestFullscreen(this: HTMLElement) {
      fullscreenElement = this;
      document.dispatchEvent(new Event('fullscreenchange'));
    }),
  });

  Object.defineProperty(window.screen, 'orientation', {
    configurable: true,
    value: {
      lock: orientationLockMock,
      unlock: orientationUnlockMock,
    },
  });

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
});

afterEach(() => {
  cleanup();
  document.body.className = '';
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('TerminalScreen', () => {
  it('renders the current terminal orientation and exposes the toggle button', async () => {
    const user = userEvent.setup();
    const onToggleOutputOrientation = vi.fn();
    const { container, rerender } = render(
      <TerminalScreen
        {...buildProps({
          outputOrientation: 'landscape',
          onToggleOutputOrientation,
        })}
      />,
    );

    expect(container.querySelector('.terminal-screen')).toHaveClass('terminal-screen--landscape');
    expect(container.querySelector('.terminal-view')).toHaveClass('terminal-view--landscape');

    await openToolbarMenu(user);
    await user.click(screen.getByRole('button', { name: /atual: landscape/i }));

    expect(onToggleOutputOrientation).toHaveBeenCalledTimes(1);

    rerender(<TerminalScreen {...buildProps({ outputOrientation: 'portrait' })} />);

    expect(container.querySelector('.terminal-screen')).toHaveClass('terminal-screen--portrait');
    expect(container.querySelector('.terminal-view')).toHaveClass('terminal-view--portrait');

    await openToolbarMenu(user);
    expect(screen.getByRole('button', { name: /atual: portrait/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /abrir terminal em tela cheia/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Arquivos' })).toBeInTheDocument();
  });

  it('opens the file search flow from the header action', async () => {
    const user = userEvent.setup();
    const onOpenFiles = vi.fn();

    render(<TerminalScreen {...buildProps({ onOpenFiles })} />);

    await user.click(screen.getByRole('button', { name: 'Arquivos' }));

    expect(onOpenFiles).toHaveBeenCalledTimes(1);
  });

  it('opens the mobile session drawer and routes its actions', async () => {
    const user = userEvent.setup();
    const onOpenFiles = vi.fn();
    const onCreateSession = vi.fn();
    const onSelectSession = vi.fn();
    const onCloseSessionTab = vi.fn();
    const onIncreaseFont = vi.fn();

    render(
      <TerminalScreen
        {...buildProps({
          onOpenFiles,
          onCreateSession,
          onSelectSession,
          onCloseSessionTab,
          onIncreaseFont,
          sessionTabs: [
            {
              id: 'session-a',
              label: 'repo-a',
              path: '/workspace/repo-a',
              status: 'active',
              active: true,
              hasDraft: false,
            },
            {
              id: 'session-b',
              label: 'repo-b',
              path: '/workspace/repo-b',
              status: 'creating',
              active: false,
              hasDraft: true,
            },
          ],
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));

    const dialog = screen.getByRole('dialog', { name: 'Menu' });

    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('Ativa: repo-a')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'A+' })).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'A+' }));
    expect(onIncreaseFont).toHaveBeenCalledTimes(1);

    await user.click(within(dialog).getByRole('button', { name: /^repo-b/i }));
    expect(onSelectSession).toHaveBeenCalledWith('session-b');

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));
    await user.click(
      within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', {
        name: /fechar sessao do workspace repo-a/i,
      }),
    );
    expect(onCloseSessionTab).toHaveBeenCalledWith('session-a');

    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: 'Arquivos' }));
    expect(onOpenFiles).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));
    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: /\+ sessão/i }));
    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });

  it('enters fullscreen, hides the normal chrome, and suppresses conflicting overlays', async () => {
    const user = userEvent.setup();
    const onCloseCommandPicker = vi.fn();
    const onCloseMentionSheet = vi.fn();
    const { container } = render(
      <TerminalScreen
        {...buildProps({
          onCloseCommandPicker,
          onCloseMentionSheet,
          outputHistoryHasContent: true,
          outputHistoryItems: [{
            id: 'terminal-1',
            source: 'terminal',
            rawText: 'linha 1',
            displayText: 'linha 1',
            createdAt: 1,
            order: 1,
          }],
        })}
      />,
    );

    await openToolbarMenu(user);
    await user.click(screen.getByRole('button', { name: /abrir popup para copiar linhas do output/i }));
    expect(screen.getByText('Copiar output')).toBeInTheDocument();

    await openToolbarMenu(user);
    await user.click(screen.getByRole('button', { name: /abrir terminal em tela cheia/i }));

    expect(container.querySelector('.terminal-screen')).toHaveClass('terminal-screen--fullscreen');
    expect(document.body).toHaveClass('terminal-fullscreen-active');
    expect(screen.queryByText('Copilot')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Commands' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/acoes rapidas do terminal/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/digite um comando ou prompt/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Copiar output')).not.toBeInTheDocument();
    expect(onCloseCommandPicker).toHaveBeenCalled();
    expect(onCloseMentionSheet).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: /sair da tela cheia do terminal/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /atual: landscape/i })).toBeInTheDocument();
  });

  it('syncs native fullscreen changes, orientation lock, and exit events', async () => {
    const user = userEvent.setup();
    const onFullscreenChange = vi.fn();
    const onTerminalViewportChange = vi.fn();
    const onToggleOutputOrientation = vi.fn();
    const { container, rerender } = render(
      <TerminalScreen
        {...buildProps({
          onFullscreenChange,
          onTerminalViewportChange,
          onToggleOutputOrientation,
          outputOrientation: 'landscape',
        })}
      />,
    );

    await openToolbarMenu(user);
    await user.click(screen.getByRole('button', { name: /abrir terminal em tela cheia/i }));

    await waitFor(() => {
      expect(container.querySelector('.terminal-screen')).toHaveClass('terminal-screen--fullscreen-native');
    });

    expect(container.querySelector('.terminal-view__surface')).not.toHaveStyle({
      transform: 'translate(-50%, -50%) rotate(90deg)',
    });

    expect(onFullscreenChange).toHaveBeenLastCalledWith(true);
    expect(orientationLockMock).toHaveBeenCalledWith('landscape');
    expect(onTerminalViewportChange).toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: /atual: landscape/i }));
    expect(onToggleOutputOrientation).toHaveBeenCalledTimes(1);

    rerender(
      <TerminalScreen
        {...buildProps({
          onFullscreenChange,
          onTerminalViewportChange,
          onToggleOutputOrientation,
          outputOrientation: 'portrait',
        })}
      />,
    );

    await waitFor(() => {
      expect(orientationLockMock).toHaveBeenLastCalledWith('portrait');
    });

    fullscreenElement = null;
    document.dispatchEvent(new Event('fullscreenchange'));

    await waitFor(() => {
      expect(container.querySelector('.terminal-screen')).not.toHaveClass('terminal-screen--fullscreen');
    });

    expect(onFullscreenChange).toHaveBeenLastCalledWith(false);
    expect(orientationUnlockMock).toHaveBeenCalled();
  });

  it('exposes multi-session actions through the main menu', async () => {
    const user = userEvent.setup();
    const onSelectSession = vi.fn();
    const onCreateSession = vi.fn();
    const onCloseSessionTab = vi.fn();

    render(
      <TerminalScreen
        {...buildProps({
          sessionTabs: [
            {
              id: 'session-a',
              label: 'repo-a',
              path: '/workspace/repo-a',
              status: 'active',
              active: true,
              hasDraft: false,
            },
            {
              id: 'session-b',
              label: 'repo-b',
              path: '/workspace/repo-b',
              status: 'creating',
              active: false,
              hasDraft: true,
            },
          ],
          onSelectSession,
          onCreateSession,
          onCloseSessionTab,
        })}
      />,
    );

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));

    const dialog = screen.getByRole('dialog', { name: 'Menu' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('Rascunho')).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /^repo-b/i }));
    expect(onSelectSession).toHaveBeenCalledWith('session-b');

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));
    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: /fechar sessao do workspace repo-a/i }));
    expect(onCloseSessionTab).toHaveBeenCalledWith('session-a');

    await user.click(screen.getByRole('button', { name: /abrir menu principal/i }));
    await user.click(within(screen.getByRole('dialog', { name: 'Menu' })).getByRole('button', { name: /\+ sessão/i }));
    expect(onCreateSession).toHaveBeenCalledTimes(1);
  });
});
