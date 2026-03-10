import { useEffect, useRef, useState } from 'react';
import { ConnectionScreen } from './components/ConnectionScreen';
import { StatusBanner } from './components/StatusBanner';
import { TerminalScreen } from './components/TerminalScreen';
import { WorkspacePicker } from './components/WorkspacePicker';
import { useLocalStorage } from './hooks/useLocalStorage';
import { useMentionSearch } from './hooks/useMentionSearch';
import { useOutputHistory } from './hooks/useOutputHistory';
import { useSession } from './hooks/useSession';
import { useTerminal } from './hooks/useTerminal';
import { useTheme } from './hooks/useTheme';
import { useViewportResize } from './hooks/useViewportResize';
import { useWebSocket } from './hooks/useWebSocket';
import { useWorkspaceCatalog } from './hooks/useWorkspaceCatalog';
import { getPromptSubmitSequence, submitPromptToTerminal } from './lib/terminalInput';
import type { CommandProfile, ContextSearchItem, WorkspaceInfo } from './lib/protocol';
import type { CommandCatalogItem } from './lib/commandCatalog';

function getDefaultWebSocketUrl(): string {
  if (typeof window === 'undefined') {
    return `ws://127.0.0.1:${import.meta.env.VITE_BACKEND_PORT || '3000'}`;
  }

  const explicitUrl = import.meta.env.VITE_WS_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = import.meta.env.VITE_BACKEND_HOST?.trim() || window.location.hostname || '127.0.0.1';
  const port = import.meta.env.VITE_BACKEND_PORT?.trim() || '3000';
  return `${protocol}://${host}:${port}`;
}

export function App() {
  const [url, setUrl] = useLocalStorage('copilot_ws_url', getDefaultWebSocketUrl());
  const [token, setToken] = useLocalStorage('copilot_ws_token', '');
  const [cwd, setCwd] = useLocalStorage('copilot_cwd', '/tmp');
  const [rawMode, setRawMode] = useLocalStorage('copilot_raw_mode', false);
  const [fontSize, setFontSize] = useLocalStorage('copilot_font_size', 14);
  const [inputValue, setInputValue] = useState('');
  const [inputCursor, setInputCursor] = useState(0);
  const [commandPickerOpen, setCommandPickerOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [pendingCustomWorkspacePath, setPendingCustomWorkspacePath] = useState<string | null>(null);
  const [activeCommandProfile, setActiveCommandProfile] = useState<CommandProfile>('copilot-interactive');
  const pendingSubmitCleanupRef = useRef<(() => void) | null>(null);

  const { theme, themeDefinition, toggleTheme } = useTheme();
  const socket = useWebSocket();
  const session = useSession({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
  });
  const workspaceCatalog = useWorkspaceCatalog({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
  });
  const terminal = useTerminal(themeDefinition, fontSize);
  const {
    items: outputHistoryItems,
    hasContent: outputHistoryHasContent,
    replaceItems: replaceOutputHistoryItems,
    clear: clearOutputHistory,
  } = useOutputHistory({
    resetSignal: session.sessionId ?? session.status,
  });

  useEffect(() => {
    if (socket.status === 'open' && session.status === 'idle' && workspaceCatalog.status === 'idle') {
      workspaceCatalog.requestWorkspaces();
    }

    if (socket.status !== 'open') {
      setWorkspacePickerOpen(false);
    }
  }, [session.status, socket.status, workspaceCatalog]);

  useEffect(() => {
    if (workspaceCatalog.status !== 'ready' || workspaceCatalog.workspaces.length === 0) {
      return;
    }

    const selectedExists = workspaceCatalog.workspaces.some((workspace) => workspace.path === cwd);
    if (!selectedExists) {
      setCwd(workspaceCatalog.workspaces[0].path);
    }
  }, [cwd, setCwd, workspaceCatalog.status, workspaceCatalog.workspaces]);

  useEffect(() => {
    if (!pendingCustomWorkspacePath || workspaceCatalog.status !== 'ready') {
      return;
    }

    const addedWorkspace = workspaceCatalog.workspaces.find(
      (workspace) => workspace.path === pendingCustomWorkspacePath,
    );

    if (!addedWorkspace) {
      return;
    }

    setCwd(addedWorkspace.path);
    setWorkspacePickerOpen(false);
    setPendingCustomWorkspacePath(null);
  }, [pendingCustomWorkspacePath, setCwd, workspaceCatalog.status, workspaceCatalog.workspaces]);

  useEffect(() => {
    if (workspaceCatalog.status === 'error' && pendingCustomWorkspacePath) {
      setPendingCustomWorkspacePath(null);
    }
  }, [pendingCustomWorkspacePath, workspaceCatalog.status]);

  useEffect(() => {
    return session.addOutputListener((chunk) => {
      terminal.write(chunk, () => {
        replaceOutputHistoryItems(terminal.readOutputHistory());
      });
    });
  }, [replaceOutputHistoryItems, session, terminal]);

  useEffect(() => {
    if (session.status !== 'creating' && session.status !== 'idle') {
      return;
    }

    terminal.reset();
    clearOutputHistory();
  }, [clearOutputHistory, session.status, terminal]);

  useEffect(() => {
    return () => {
      pendingSubmitCleanupRef.current?.();
    };
  }, []);

  useViewportResize(() => {
    terminal.fit();
    const size = terminal.getSize();
    session.resize(size.cols, size.rows);
  });

  const mentionSearch = useMentionSearch({
    value: inputValue,
    cursor: inputCursor,
    sessionStatus: session.status,
    searchContext: session.searchContext,
    addSearchResultsListener: session.addSearchResultsListener,
  });

  function resetConnectionFlow() {
    setWorkspacePickerOpen(false);
    workspaceCatalog.reset();
    session.closeSession();
    socket.disconnect();
    session.resetSession();
    terminal.reset();
    clearOutputHistory();
  }

  function handleConnectionValueChange(nextValue: string, apply: (value: string) => void, currentValue: string) {
    if (nextValue === currentValue) {
      return;
    }

    if (session.status === 'idle' && socket.status !== 'idle' && socket.status !== 'closed') {
      socket.disconnect();
      workspaceCatalog.reset();
    }

    apply(nextValue);
  }

  function handleConnect(commandProfile: CommandProfile) {
    if (socket.status !== 'open') {
      setWorkspacePickerOpen(false);
      workspaceCatalog.reset();
      socket.connect(url, token);
      return;
    }

    const selectedWorkspace = workspaceCatalog.workspaces.find((workspace) => workspace.path === cwd);
    if (!selectedWorkspace) {
      return;
    }

    const size = terminal.getSize();
    setActiveCommandProfile(commandProfile);
    session.createSession({
      cwd: selectedWorkspace.path,
      cols: size.cols,
      rows: size.rows,
      commandProfile,
    });
  }

  function handleLoadWorkspaces() {
    setWorkspacePickerOpen(false);

    if (socket.status !== 'open') {
      workspaceCatalog.reset();
      socket.connect(url, token);
      return;
    }

    workspaceCatalog.requestWorkspaces();
  }

  function handleSelectWorkspace(workspace: WorkspaceInfo) {
    setCwd(workspace.path);
    setWorkspacePickerOpen(false);
  }

  function handleAddCustomWorkspace(path: string) {
    setPendingCustomWorkspacePath(path);
    workspaceCatalog.addCustomWorkspace(path);
  }

  function handleSend() {
    if (session.status !== 'active') {
      return;
    }

    if (rawMode) {
      session.sendInput('\r');
      setInputValue('');
      setInputCursor(0);
      mentionSearch.close();
      return;
    }

    if (!inputValue.trim()) {
      return;
    }

    pendingSubmitCleanupRef.current = submitPromptToTerminal(
      session.sendInput,
      inputValue,
      getPromptSubmitSequence(activeCommandProfile),
    );
    setInputValue('');
    setInputCursor(0);
    mentionSearch.close();
  }

  function handleQuickAction(value: string) {
    if (session.status !== 'active') {
      return;
    }

    session.sendInput(value);
  }

  function handleInputChange(value: string, cursor: number) {
    setInputValue(value);
    setInputCursor(cursor);

    if (rawMode && session.status === 'active' && value.length > inputValue.length) {
      const appended = value.slice(inputValue.length);
      if (appended) {
        session.sendInput(appended);
      }
    }
  }

  function handleCursorChange(cursor: number) {
    setInputCursor(cursor);
  }

  function handleSelectCommand(item: CommandCatalogItem) {
    setCommandPickerOpen(false);
    const suffix = inputValue.length > 0 && !inputValue.endsWith(' ') ? ' ' : '';
    const nextValue = `${inputValue}${suffix}${item.insertText}`;
    setInputValue(nextValue);
    setInputCursor(nextValue.length);
  }

  function handleSelectMentionItem(item: ContextSearchItem) {
    const next = mentionSearch.applyItem(item);
    if (!next) {
      return;
    }
    setInputValue(next);
    setInputCursor(next.length);
  }

  const selectedWorkspace = workspaceCatalog.workspaces.find((workspace) => workspace.path === cwd) ?? null;
  const showTerminal = session.status !== 'idle';

  return (
    <main className="app-shell" data-theme={theme}>
      <div className="background-orb background-orb--left" />
      <div className="background-orb background-orb--right" />

      {!showTerminal ? (
        <ConnectionScreen
          url={url}
          token={token}
          selectedWorkspace={selectedWorkspace}
          workspaceCount={workspaceCatalog.workspaces.length}
          workspaceStatus={workspaceCatalog.status}
          workspaceErrorMessage={workspaceCatalog.errorMessage}
          themeLabel={theme === 'dracula' ? '☀' : '☾'}
          status={socket.status}
          errorMessage={socket.errorMessage}
          onUrlChange={(value) => handleConnectionValueChange(value, setUrl, url)}
          onTokenChange={(value) => handleConnectionValueChange(value, setToken, token)}
          onLoadWorkspaces={handleLoadWorkspaces}
          onOpenWorkspacePicker={() => setWorkspacePickerOpen(true)}
          onToggleTheme={toggleTheme}
          onConnect={handleConnect}
        />
      ) : (
        <TerminalScreen
          terminal={terminal}
          theme={themeDefinition}
          socketStatus={socket.status}
          sessionStatus={session.status}
          sessionError={session.errorMessage ?? socket.errorMessage}
          outputHistoryItems={outputHistoryItems}
          outputHistoryHasContent={outputHistoryHasContent}
          mentionQuery={mentionSearch.query}
          mentionStatus={mentionSearch.status}
          inputValue={inputValue}
          inputCursor={inputCursor}
          rawMode={rawMode}
          mentionItems={mentionSearch.items}
          mentionOpen={mentionSearch.isOpen}
          onMentionQueryChange={mentionSearch.setQuery}
          onInputChange={handleInputChange}
          onInputCursorChange={handleCursorChange}
          onSend={handleSend}
          onQuickAction={handleQuickAction}
          onToggleCommands={() => setCommandPickerOpen((current) => !current)}
          onToggleRawMode={() => setRawMode((current) => !current)}
          onCloseSession={resetConnectionFlow}
          onToggleTheme={toggleTheme}
          commandPickerOpen={commandPickerOpen}
          onCloseCommandPicker={() => setCommandPickerOpen(false)}
          onSelectCommand={handleSelectCommand}
          onCloseMentionSheet={mentionSearch.close}
          onSelectMentionItem={handleSelectMentionItem}
          fontSize={fontSize}
          onIncreaseFont={() => setFontSize((current) => Math.min(current + 1, 18))}
          onDecreaseFont={() => setFontSize((current) => Math.max(current - 1, 11))}
        />
      )}

      <WorkspacePicker
        open={!showTerminal && workspacePickerOpen}
        workspaces={workspaceCatalog.workspaces}
        selectedPath={selectedWorkspace?.path ?? null}
        errorMessage={workspaceCatalog.errorMessage}
        isBusy={workspaceCatalog.status === 'loading'}
        onClose={() => setWorkspacePickerOpen(false)}
        onAddCustomWorkspace={handleAddCustomWorkspace}
        onSelect={handleSelectWorkspace}
      />

      {session.status === 'disconnected' ? (
        <StatusBanner
          tone="warning"
          message="Conexao retomada. Crie uma nova sessao para continuar."
          actionLabel="Nova sessao"
          onAction={resetConnectionFlow}
        />
      ) : null}
    </main>
  );
}