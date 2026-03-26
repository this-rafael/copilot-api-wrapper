import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConnectionScreen } from './components/ConnectionScreen';
import { FileSearchSheet } from './components/FileSearchSheet';
import { PromptImproverSheet } from './components/PromptImproverSheet';
import { TerminalScreen } from './components/TerminalScreen';
import { WorkspaceFileEditor } from './components/WorkspaceFileEditor';
import { WorkspacePicker } from './components/WorkspacePicker';
import { GitPanel } from './components/GitPanel';
import { useCopilotResourceCatalog } from './hooks/useCopilotResourceCatalog';
import { useDocumentAutocomplete } from './hooks/useDocumentAutocomplete';
import { useLocalStorage } from './hooks/useLocalStorage';
import { type MentionSearchSnapshot, useMentionSearch } from './hooks/useMentionSearch';
import { type PromptAutocompleteSnapshot, usePromptAutocomplete } from './hooks/usePromptAutocomplete';
import { useSessionManager } from './hooks/useSessionManager';
import { useTerminal } from './hooks/useTerminal';
import { useTheme } from './hooks/useTheme';
import { useViewportResize } from './hooks/useViewportResize';
import { useWebSocket } from './hooks/useWebSocket';
import { useWorkspaceFileEditor } from './hooks/useWorkspaceFileEditor';
import { useWorkspaceFileSearch } from './hooks/useWorkspaceFileSearch';
import { useWorkspaceCatalog } from './hooks/useWorkspaceCatalog';
import { useGit } from './hooks/useGit';
import { detectLanguageId } from './lib/fileLanguages';
import { getPromptSubmitSequence, submitPromptToTerminal } from './lib/terminalInput';
import type { CommandCatalogItem } from './lib/commandCatalog';
import type { OutputHistoryItem } from './lib/terminalOutput';
import type { CommandProfile, ContextSearchItem, CopilotResourceItem, WorkspaceInfo } from './lib/protocol';

interface SessionTabState {
  id: string;
  workspace: WorkspaceInfo;
  commandProfile: CommandProfile;
  inputValue: string;
  inputCursor: number;
  rawMode: boolean;
  mentionSnapshot: MentionSearchSnapshot;
  autocompleteSnapshot: PromptAutocompleteSnapshot;
}

const EMPTY_MENTION_SNAPSHOT: MentionSearchSnapshot = {
  items: [],
  isOpen: false,
  status: 'idle',
  query: '',
  dismissedMentionKey: null,
};

const EMPTY_AUTOCOMPLETE_SNAPSHOT: PromptAutocompleteSnapshot = {
  items: [],
  status: 'idle',
  message: null,
  latestRequestId: 0,
  authBlocked: false,
};

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

function createEmptyTab(id: string, workspace: WorkspaceInfo, commandProfile: CommandProfile, rawMode: boolean): SessionTabState {
  return {
    id,
    workspace,
    commandProfile,
    inputValue: '',
    inputCursor: 0,
    rawMode,
    mentionSnapshot: { ...EMPTY_MENTION_SNAPSHOT },
    autocompleteSnapshot: { ...EMPTY_AUTOCOMPLETE_SNAPSHOT },
  };
}

export function App() {
  const [url, setUrl] = useLocalStorage('copilot_ws_url', getDefaultWebSocketUrl());
  const [token, setToken] = useLocalStorage('copilot_ws_token', '');
  const [cwd, setCwd] = useLocalStorage('copilot_cwd', '/tmp');
  const [defaultRawMode, setDefaultRawMode] = useLocalStorage('copilot_raw_mode', false);
  const [fontSize, setFontSize] = useLocalStorage('copilot_font_size', 14);
  const [outputOrientation, setOutputOrientation] = useLocalStorage<'portrait' | 'landscape'>(
    'copilot_output_orientation',
    'landscape',
  );
  const [commandPickerOpen, setCommandPickerOpen] = useState(false);
  const [copilotResourcePickerOpen, setCopilotResourcePickerOpen] = useState(false);
  const [workspacePickerOpen, setWorkspacePickerOpen] = useState(false);
  const [workspacePickerMode, setWorkspacePickerMode] = useState<'select-default' | 'new-session'>('select-default');
  const [pendingCustomWorkspacePath, setPendingCustomWorkspacePath] = useState<string | null>(null);
  const [activeCommandProfile, setActiveCommandProfile] = useState<CommandProfile>('copilot-interactive');
  const [terminalFullscreenActive, setTerminalFullscreenActive] = useState(false);
  const [sessionTabs, setSessionTabs] = useState<SessionTabState[]>([]);
  const [activeSessionTabId, setActiveSessionTabId] = useState<string | null>(null);
  const [outputHistoryItems, setOutputHistoryItems] = useState<OutputHistoryItem[]>([]);
  const [gitPanelOpen, setGitPanelOpen] = useState(false);
  const [promptImproverStatus, setPromptImproverStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [promptImproverResult, setPromptImproverResult] = useState<string | null>(null);
  const [promptImproverError, setPromptImproverError] = useState<string | null>(null);
  const [promptImproverOpen, setPromptImproverOpen] = useState(false);

  const pendingSubmitCleanupRef = useRef<(() => void) | null>(null);
  const nextTabSequenceRef = useRef(0);
  const previousActiveTabIdRef = useRef<string | null>(null);
  const renderedTerminalStateRef = useRef<{ tabId: string | null; renderedLength: number }>({
    tabId: null,
    renderedLength: 0,
  });

  const { theme, themeDefinition, toggleTheme } = useTheme();
  const socket = useWebSocket();
  const sessionManager = useSessionManager({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
  });
  const workspaceCatalog = useWorkspaceCatalog({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
  });
  const copilotResourceCatalog = useCopilotResourceCatalog({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
  });
  const terminal = useTerminal(themeDefinition, fontSize);

  const activeTab = useMemo(() => {
    if (sessionTabs.length === 0) {
      return null;
    }

    return sessionTabs.find((tab) => tab.id === activeSessionTabId) ?? sessionTabs[0] ?? null;
  }, [activeSessionTabId, sessionTabs]);

  const activeSession = useMemo(() => {
    if (!activeTab) {
      return null;
    }

    return sessionManager.sessions.find((session) => session.tabId === activeTab.id) ?? null;
  }, [activeTab, sessionManager.sessions]);

  const git = useGit({
    socketStatus: socket.status,
    addMessageListener: socket.addMessageListener,
    sendMessage: socket.sendMessage,
    cwd: activeTab?.workspace.path ?? null,
  });

  const activeRawMode = activeTab?.rawMode ?? defaultRawMode;
  const selectedWorkspace = workspaceCatalog.workspaces.find((workspace) => workspace.path === cwd) ?? null;
  const showTerminal = sessionTabs.length > 0;

  const updateTab = useCallback((tabId: string, updater: (tab: SessionTabState) => SessionTabState) => {
    setSessionTabs((current) => current.map((tab) => (tab.id === tabId ? updater(tab) : tab)));
  }, []);

  const createTabId = useCallback(() => {
    nextTabSequenceRef.current += 1;
    return `session-tab-${nextTabSequenceRef.current}`;
  }, []);

  const syncTerminalViewport = useCallback(() => {
    const applyViewport = () => {
      terminal.fit();

      if (!activeTab || !activeSession || activeSession.status === 'idle' || activeSession.status === 'closed') {
        return;
      }

      const size = terminal.getSize();
      sessionManager.resize(activeTab.id, size.cols, size.rows);
    };

    applyViewport();

    window.requestAnimationFrame(() => {
      applyViewport();
      window.requestAnimationFrame(() => {
        applyViewport();
      });
    });
  }, [activeSession, activeTab, sessionManager, terminal]);

  useViewportResize(syncTerminalViewport);

  useEffect(() => {
    if (socket.status === 'open' && workspaceCatalog.status === 'idle') {
      workspaceCatalog.requestWorkspaces();
    }

    if (socket.status !== 'open') {
      setWorkspacePickerOpen(false);
    }
  }, [socket.status, workspaceCatalog.requestWorkspaces, workspaceCatalog.status]);

  useEffect(() => {
    if (socket.status !== 'open' || workspaceCatalog.status !== 'ready') {
      return;
    }

    copilotResourceCatalog.requestResources();
  }, [copilotResourceCatalog.requestResources, socket.status, workspaceCatalog.status, workspaceCatalog.workspaces]);

  useEffect(() => {
    if (workspaceCatalog.status !== 'ready' || workspaceCatalog.workspaces.length === 0) {
      return;
    }

    const selectedExists = workspaceCatalog.workspaces.some((workspace) => workspace.path === cwd);
    if (!selectedExists) {
      setCwd(workspaceCatalog.workspaces[0].path);
    }
  }, [cwd, setCwd, workspaceCatalog.status, workspaceCatalog.workspaces]);

  const createOrFocusSession = useCallback((workspace: WorkspaceInfo, commandProfile: CommandProfile) => {
    setCwd(workspace.path);

    const existingTab = sessionTabs.find((tab) => tab.workspace.path === workspace.path);
    if (existingTab) {
      setActiveSessionTabId(existingTab.id);
      setWorkspacePickerOpen(false);
      return;
    }

    const tabId = createTabId();
    const size = terminal.getSize();
    const nextTab = createEmptyTab(tabId, workspace, commandProfile, defaultRawMode);

    setSessionTabs((current) => [...current, nextTab]);
    setActiveSessionTabId(tabId);
    setActiveCommandProfile(commandProfile);
    setWorkspacePickerOpen(false);
    renderedTerminalStateRef.current = { tabId: null, renderedLength: 0 };
    setOutputHistoryItems([]);

    sessionManager.createSession({
      tabId,
      cwd: workspace.path,
      cols: size.cols,
      rows: size.rows,
      commandProfile,
    });
  }, [createTabId, defaultRawMode, sessionManager, sessionTabs, setCwd, terminal]);

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

    setPendingCustomWorkspacePath(null);
    if (workspacePickerMode === 'new-session' || showTerminal) {
      createOrFocusSession(addedWorkspace, activeCommandProfile);
      return;
    }

    setCwd(addedWorkspace.path);
    setWorkspacePickerOpen(false);
  }, [
    activeCommandProfile,
    createOrFocusSession,
    pendingCustomWorkspacePath,
    setCwd,
    showTerminal,
    workspaceCatalog.status,
    workspaceCatalog.workspaces,
    workspacePickerMode,
  ]);

  useEffect(() => {
    if (workspaceCatalog.status === 'error' && pendingCustomWorkspacePath) {
      setPendingCustomWorkspacePath(null);
    }
  }, [pendingCustomWorkspacePath, workspaceCatalog.status]);

  useEffect(() => {
    return () => {
      pendingSubmitCleanupRef.current?.();
    };
  }, []);

  useEffect(() => {
    const nextTabId = activeTab?.id ?? null;
    const nextOutput = activeSession?.output ?? '';

    if (!nextTabId) {
      terminal.reset();
      renderedTerminalStateRef.current = { tabId: null, renderedLength: 0 };
      setOutputHistoryItems([]);
      return;
    }

    const syncOutputHistory = () => {
      setOutputHistoryItems(terminal.readOutputHistory());
    };

    const renderedState = renderedTerminalStateRef.current;
    if (renderedState.tabId !== nextTabId || nextOutput.length < renderedState.renderedLength) {
      terminal.reset();
      renderedTerminalStateRef.current = { tabId: nextTabId, renderedLength: 0 };

      if (!nextOutput) {
        setOutputHistoryItems([]);
        const frame = window.requestAnimationFrame(() => {
          syncTerminalViewport();
        });
        return () => window.cancelAnimationFrame(frame);
      }

      terminal.write(nextOutput, () => {
        renderedTerminalStateRef.current = { tabId: nextTabId, renderedLength: nextOutput.length };
        syncOutputHistory();
        syncTerminalViewport();
      });
      return;
    }

    if (nextOutput.length === renderedState.renderedLength) {
      return;
    }

    const delta = nextOutput.slice(renderedState.renderedLength);
    terminal.write(delta, () => {
      renderedTerminalStateRef.current = { tabId: nextTabId, renderedLength: nextOutput.length };
      syncOutputHistory();
    });
  }, [activeSession?.output, activeTab?.id, syncTerminalViewport, terminal]);

  useEffect(() => {
    if (!activeTab || !activeSession) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      syncTerminalViewport();
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeSession?.status, activeTab?.id, outputOrientation, syncTerminalViewport]);

  const mentionSearch = useMentionSearch({
    value: activeTab?.inputValue ?? '',
    cursor: activeTab?.inputCursor ?? 0,
    sessionKey: activeTab?.id,
    sessionStatus: activeSession?.status ?? 'idle',
    searchContext: (mentionType, query, limit) => {
      if (!activeTab) {
        return;
      }

      sessionManager.searchContext(activeTab.id, mentionType, query, limit);
    },
    addSearchResultsListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addSearchResultsListener(activeTab.id, listener);
    },
    snapshot: activeTab?.mentionSnapshot,
    onSnapshotChange: (snapshot) => {
      if (!activeTab) {
        return;
      }

      updateTab(activeTab.id, (tab) => ({
        ...tab,
        mentionSnapshot: snapshot,
      }));
    },
  });

  const fileSearch = useWorkspaceFileSearch({
    sessionStatus: activeSession?.status ?? 'idle',
    searchContext: (mentionType, query, limit) => {
      if (!activeTab) {
        return;
      }

      sessionManager.searchContext(activeTab.id, mentionType, query, limit);
    },
    addSearchResultsListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addSearchResultsListener(activeTab.id, listener);
    },
  });

  const fileEditor = useWorkspaceFileEditor({
    sessionId: activeSession?.sessionId ?? null,
    sessionStatus: activeSession?.status ?? 'idle',
    addMessageListener: socket.addMessageListener,
    addFileReadListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addFileReadListener(activeTab.id, listener);
    },
    addFileWriteListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addFileWriteListener(activeTab.id, listener);
    },
    readFile: (path) => {
      if (!activeTab) {
        return;
      }

      sessionManager.readFile(activeTab.id, path);
    },
    writeFile: (path, content, versionToken) => {
      if (!activeTab) {
        return;
      }

      sessionManager.writeFile(activeTab.id, path, content, versionToken);
    },
  });

  const promptAutocomplete = usePromptAutocomplete({
    value: activeTab?.inputValue ?? '',
    cursor: activeTab?.inputCursor ?? 0,
    rawMode: activeRawMode,
    sessionKey: activeTab?.id,
    disabled: mentionSearch.isOpen || Boolean(mentionSearch.activeMention) || fileSearch.isOpen || fileEditor.isOpen,
    sessionStatus: activeSession?.status ?? 'idle',
    requestAutocomplete: (requestId, text, cursor, languageId, tabSize, insertSpaces) => {
      if (!activeTab) {
        return;
      }

      sessionManager.requestAutocomplete(activeTab.id, requestId, text, cursor, languageId, tabSize, insertSpaces);
    },
    acceptAutocomplete: (suggestionId) => {
      if (!activeTab) {
        return;
      }

      sessionManager.acceptAutocomplete(activeTab.id, suggestionId);
    },
    addAutocompleteResultsListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addAutocompleteResultsListener(activeTab.id, listener);
    },
    addAutocompleteStatusListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addAutocompleteStatusListener(activeTab.id, listener);
    },
    snapshot: activeTab?.autocompleteSnapshot,
    onSnapshotChange: (snapshot) => {
      if (!activeTab) {
        return;
      }

      updateTab(activeTab.id, (tab) => ({
        ...tab,
        autocompleteSnapshot: snapshot,
      }));
    },
  });

  const fileEditorAutocomplete = useDocumentAutocomplete({
    value: fileEditor.value,
    cursor: fileEditor.cursor,
    documentPath: fileEditor.path,
    languageId: detectLanguageId(fileEditor.path ?? ''),
    disabled: !fileEditor.isOpen || fileEditor.status === 'loading',
    sessionStatus: activeSession?.status ?? 'idle',
    requestAutocomplete: (requestId, text, cursor, languageId, tabSize, insertSpaces, documentPath) => {
      if (!activeTab) {
        return;
      }

      sessionManager.requestAutocomplete(
        activeTab.id,
        requestId,
        text,
        cursor,
        languageId,
        tabSize,
        insertSpaces,
        documentPath,
      );
    },
    acceptAutocomplete: (suggestionId) => {
      if (!activeTab) {
        return;
      }

      sessionManager.acceptAutocomplete(activeTab.id, suggestionId);
    },
    addAutocompleteResultsListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addAutocompleteResultsListener(activeTab.id, listener);
    },
    addAutocompleteStatusListener: (listener) => {
      if (!activeTab) {
        return () => undefined;
      }

      return sessionManager.addAutocompleteStatusListener(activeTab.id, listener);
    },
  });

  useEffect(() => {
    const previousTabId = previousActiveTabIdRef.current;
    const nextTabId = activeTab?.id ?? null;

    if (previousTabId && nextTabId && previousTabId !== nextTabId) {
      fileSearch.close();
      fileEditor.close();
    }

    previousActiveTabIdRef.current = nextTabId;
  }, [activeTab?.id, fileEditor.close, fileSearch.close]);

  useEffect(() => {
    if (!terminalFullscreenActive) {
      return;
    }

    setCommandPickerOpen(false);
    setCopilotResourcePickerOpen(false);
    fileSearch.close();
    mentionSearch.close();
    promptAutocomplete.dismiss();
  }, [fileSearch.close, mentionSearch.close, promptAutocomplete.dismiss, terminalFullscreenActive]);

  useEffect(() => {
    return socket.addMessageListener((msg) => {
      if (msg.type === 'prompt.improve.result') {
        setPromptImproverResult(msg.improvedPrompt);
        setPromptImproverStatus('ready');
        setPromptImproverOpen(true);
      } else if (msg.type === 'prompt.improve.error') {
        setPromptImproverError(msg.message);
        setPromptImproverStatus('error');
        setPromptImproverOpen(true);
      }
    });
  }, [socket.addMessageListener]);

  function handleConnectionValueChange(nextValue: string, apply: (value: string) => void, currentValue: string) {
    if (nextValue === currentValue) {
      return;
    }

    if (!showTerminal && socket.status !== 'idle' && socket.status !== 'closed') {
      socket.disconnect();
      workspaceCatalog.reset();
      copilotResourceCatalog.reset();
    }

    apply(nextValue);
  }

  function handleConnect(commandProfile: CommandProfile) {
    if (socket.status !== 'open') {
      setWorkspacePickerOpen(false);
      workspaceCatalog.reset();
      copilotResourceCatalog.reset();
      socket.connect(url, token);
      return;
    }

    const workspace = workspaceCatalog.workspaces.find((item) => item.path === cwd);
    if (!workspace) {
      return;
    }

    createOrFocusSession(workspace, commandProfile);
  }

  function handleLoadWorkspaces() {
    setWorkspacePickerOpen(false);

    if (socket.status !== 'open') {
      workspaceCatalog.reset();
      copilotResourceCatalog.reset();
      socket.connect(url, token);
      return;
    }

    workspaceCatalog.requestWorkspaces();
  }

  function handleSelectWorkspace(workspace: WorkspaceInfo) {
    if (workspacePickerMode === 'new-session' || showTerminal) {
      createOrFocusSession(workspace, activeCommandProfile);
      return;
    }

    setCwd(workspace.path);
    setWorkspacePickerOpen(false);
  }

  function handleOpenWorkspacePicker(mode: 'select-default' | 'new-session') {
    setWorkspacePickerMode(mode);
    setWorkspacePickerOpen(true);

    if (socket.status === 'open' && workspaceCatalog.status === 'idle') {
      workspaceCatalog.requestWorkspaces();
    }
  }

  function handleAddCustomWorkspace(path: string) {
    setPendingCustomWorkspacePath(path);
    workspaceCatalog.addCustomWorkspace(path);
  }

  function handleDiscoverGitWorkspaces() {
    workspaceCatalog.discoverGitWorkspaces();
  }

  function handleCloseSession(tabId: string) {
    pendingSubmitCleanupRef.current?.();
    pendingSubmitCleanupRef.current = null;

    if (activeTab?.id === tabId) {
      fileSearch.close();
      fileEditor.close();
    }

    let nextActiveTabId: string | null = null;
    setSessionTabs((current) => {
      const index = current.findIndex((tab) => tab.id === tabId);
      if (index === -1) {
        return current;
      }

      const nextTabs = current.filter((tab) => tab.id !== tabId);
      nextActiveTabId = nextTabs[index]?.id ?? nextTabs[index - 1]?.id ?? nextTabs[0]?.id ?? null;
      return nextTabs;
    });

    setActiveSessionTabId((current) => (current === tabId ? nextActiveTabId : current));
    setCommandPickerOpen(false);
    setCopilotResourcePickerOpen(false);
    sessionManager.closeSession(tabId);
    renderedTerminalStateRef.current = { tabId: null, renderedLength: 0 };

    if (sessionTabs.length <= 1) {
      terminal.reset();
      setOutputHistoryItems([]);
    }
  }

  function handleOpenFiles() {
    setCommandPickerOpen(false);
    setCopilotResourcePickerOpen(false);
    mentionSearch.close();
    promptAutocomplete.dismiss();
    fileSearch.open();
  }

  function handleSelectFileItem(item: ContextSearchItem) {
    fileSearch.close();
    fileEditor.openFile(item.path);
  }

  function handleAcceptFileEditorAutocomplete() {
    const next = fileEditorAutocomplete.acceptSelected();
    if (!next) {
      return;
    }

    fileEditor.setValue(next.value, next.cursor);
  }

  function handlePromptImprove() {
    if (!activeTab || !activeSession || !activeSession.sessionId || !activeTab.inputValue.trim()) {
      return;
    }

    setPromptImproverStatus('loading');
    setPromptImproverResult(null);
    setPromptImproverError(null);
    setPromptImproverOpen(true);

    socket.sendMessage({
      type: 'prompt.improve.request',
      sessionId: activeSession.sessionId,
      prompt: activeTab.inputValue,
    });
  }

  function handleApproveImprovedPrompt(improvedPrompt: string) {
    if (!activeTab) {
      return;
    }

    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: improvedPrompt,
      inputCursor: improvedPrompt.length,
    }));
    setPromptImproverOpen(false);
    setPromptImproverStatus('idle');
    setPromptImproverResult(null);
  }

  function handleCancelPromptImprover() {
    setPromptImproverOpen(false);
    setPromptImproverStatus('idle');
    setPromptImproverResult(null);
    setPromptImproverError(null);
  }

  function handleSend() {
    if (!activeTab || !activeSession || activeSession.status !== 'active') {
      return;
    }

    if (activeTab.rawMode) {
      sessionManager.sendInput(activeTab.id, '\r');
      updateTab(activeTab.id, (tab) => ({
        ...tab,
        inputValue: '',
        inputCursor: 0,
      }));
      mentionSearch.close();
      return;
    }

    if (!activeTab.inputValue.trim()) {
      return;
    }

    pendingSubmitCleanupRef.current = submitPromptToTerminal(
      (data) => sessionManager.sendInput(activeTab.id, data),
      activeTab.inputValue,
      getPromptSubmitSequence(activeTab.commandProfile),
    );

    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: '',
      inputCursor: 0,
    }));
    mentionSearch.close();
    promptAutocomplete.dismiss();
  }

  function handleQuickAction(value: string) {
    if (!activeTab || !activeSession || activeSession.status !== 'active') {
      return;
    }

    sessionManager.sendInput(activeTab.id, value);
  }

  function handleInputChange(value: string, cursor: number) {
    if (!activeTab) {
      return;
    }

    const previousValue = activeTab.inputValue;
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: value,
      inputCursor: cursor,
    }));

    if (activeTab.rawMode && activeSession?.status === 'active' && value.length > previousValue.length) {
      const appended = value.slice(previousValue.length);
      if (appended) {
        sessionManager.sendInput(activeTab.id, appended);
      }
    }
  }

  function handleCursorChange(cursor: number) {
    if (!activeTab) {
      return;
    }

    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputCursor: cursor,
    }));
  }

  function handleSelectCommand(item: CommandCatalogItem) {
    if (!activeTab) {
      return;
    }

    setCommandPickerOpen(false);
    const suffix = activeTab.inputValue.length > 0 && !activeTab.inputValue.endsWith(' ') ? ' ' : '';
    const nextValue = `${activeTab.inputValue}${suffix}${item.insertText}`;
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: nextValue,
      inputCursor: nextValue.length,
    }));
    promptAutocomplete.dismiss();
  }

  function handleSelectCopilotResource(item: CopilotResourceItem) {
    if (!activeTab) {
      return;
    }

    setCopilotResourcePickerOpen(false);
    const suffix = activeTab.inputValue.length > 0 && !activeTab.inputValue.endsWith(' ') ? ' ' : '';
    const nextValue = `${activeTab.inputValue}${suffix}${item.invocation}`;
    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: nextValue,
      inputCursor: nextValue.length,
    }));
    promptAutocomplete.dismiss();
  }

  function handleSelectMentionItem(item: ContextSearchItem) {
    if (!activeTab) {
      return;
    }

    const nextValue = mentionSearch.applyItem(item);
    if (!nextValue) {
      return;
    }

    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: nextValue,
      inputCursor: nextValue.length,
    }));
    promptAutocomplete.dismiss();
  }

  function handleAcceptAutocomplete() {
    if (!activeTab) {
      return;
    }

    const next = promptAutocomplete.acceptSelected();
    if (!next) {
      return;
    }

    updateTab(activeTab.id, (tab) => ({
      ...tab,
      inputValue: next.value,
      inputCursor: next.cursor,
    }));
  }

  return (
    <main className={`app-shell${terminalFullscreenActive ? ' app-shell--terminal-fullscreen' : ''}`} data-theme={theme}>
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
          onOpenWorkspacePicker={() => handleOpenWorkspacePicker('select-default')}
          onToggleTheme={toggleTheme}
          onConnect={handleConnect}
        />
      ) : (
        <TerminalScreen
          terminal={terminal}
          theme={themeDefinition}
          socketStatus={socket.status}
          sessionStatus={activeSession?.status ?? 'idle'}
          sessionError={activeSession?.errorMessage ?? socket.errorMessage}
          outputHistoryItems={outputHistoryItems}
          outputHistoryHasContent={outputHistoryItems.length > 0}
          mentionQuery={mentionSearch.query}
          mentionStatus={mentionSearch.status}
          inputValue={activeTab?.inputValue ?? ''}
          inputCursor={activeTab?.inputCursor ?? 0}
          rawMode={activeRawMode}
          autocompleteStatus={promptAutocomplete.status}
          autocompletePreview={promptAutocomplete.preview}
          autocompleteMessage={promptAutocomplete.message}
          mentionItems={mentionSearch.items}
          mentionOpen={mentionSearch.isOpen}
          onMentionQueryChange={mentionSearch.setQuery}
          onInputChange={handleInputChange}
          onInputCursorChange={handleCursorChange}
          onSend={handleSend}
          onAcceptAutocomplete={handleAcceptAutocomplete}
          onDismissAutocomplete={promptAutocomplete.dismiss}
          onQuickAction={handleQuickAction}
          onOpenFiles={handleOpenFiles}
          onOpenGit={() => setGitPanelOpen(true)}
          onToggleCommands={() => {
            setCopilotResourcePickerOpen(false);
            setCommandPickerOpen((current) => !current);
          }}
          onToggleCopilotResources={() => {
            setCommandPickerOpen(false);
            setCopilotResourcePickerOpen((current) => !current);
          }}
          onToggleRawMode={() => {
            if (!activeTab) {
              return;
            }

            updateTab(activeTab.id, (tab) => {
              const nextRawMode = !tab.rawMode;
              setDefaultRawMode(nextRawMode);
              return {
                ...tab,
                rawMode: nextRawMode,
              };
            });
          }}
          onCloseSession={() => {
            if (!activeTab) {
              return;
            }

            handleCloseSession(activeTab.id);
          }}
          onToggleTheme={toggleTheme}
          commandPickerOpen={commandPickerOpen}
          copilotResourcePickerOpen={copilotResourcePickerOpen}
          onCloseCommandPicker={() => setCommandPickerOpen(false)}
          onCloseCopilotResourcePicker={() => setCopilotResourcePickerOpen(false)}
          onSelectCommand={handleSelectCommand}
          copilotResourceItems={copilotResourceCatalog.items}
          copilotResourceError={copilotResourceCatalog.errorMessage}
          copilotResourceLoading={copilotResourceCatalog.status === 'loading'}
          onReloadCopilotResources={copilotResourceCatalog.requestResources}
          onSelectCopilotResource={handleSelectCopilotResource}
          onCloseMentionSheet={mentionSearch.close}
          onSelectMentionItem={handleSelectMentionItem}
          fontSize={fontSize}
          outputOrientation={outputOrientation}
          onToggleOutputOrientation={() => setOutputOrientation((current) => (
            current === 'landscape' ? 'portrait' : 'landscape'
          ))}
          onIncreaseFont={() => setFontSize((current) => Math.min(current + 1, 18))}
          onDecreaseFont={() => setFontSize((current) => Math.max(current - 1, 11))}
          onFullscreenChange={setTerminalFullscreenActive}
          onTerminalViewportChange={syncTerminalViewport}
          sessionTabs={sessionTabs.map((tab) => {
            const runtime = sessionManager.sessions.find((session) => session.tabId === tab.id);
            return {
              id: tab.id,
              label: tab.workspace.name,
              path: tab.workspace.path,
              status: runtime?.status ?? 'idle',
              active: tab.id === activeTab?.id,
              hasDraft: tab.inputValue.trim().length > 0,
            };
          })}
          onSelectSession={setActiveSessionTabId}
          onCreateSession={() => handleOpenWorkspacePicker('new-session')}
          onCloseSessionTab={handleCloseSession}
          promptImproveStatus={promptImproverStatus === 'loading' ? 'loading' : 'idle'}
          onPromptImprove={handlePromptImprove}
        />
      )}

      <WorkspacePicker
        open={workspacePickerOpen}
        workspaces={workspaceCatalog.workspaces}
        selectedPath={activeTab?.workspace.path ?? selectedWorkspace?.path ?? null}
        errorMessage={workspaceCatalog.errorMessage}
        busyAction={workspaceCatalog.pendingAction}
        isBusy={workspaceCatalog.status === 'loading'}
        onClose={() => setWorkspacePickerOpen(false)}
        onDiscoverGitWorkspaces={handleDiscoverGitWorkspaces}
        onAddCustomWorkspace={handleAddCustomWorkspace}
        onSelect={handleSelectWorkspace}
      />

      <FileSearchSheet
        open={fileSearch.isOpen}
        query={fileSearch.query}
        status={fileSearch.status}
        items={fileSearch.items}
        onQueryChange={fileSearch.setQuery}
        onSelect={handleSelectFileItem}
        onClose={fileSearch.close}
      />

      <WorkspaceFileEditor
        key={fileEditor.path ?? 'workspace-file-editor'}
        open={fileEditor.isOpen}
        path={fileEditor.path}
        value={fileEditor.value}
        cursor={fileEditor.cursor}
        status={fileEditor.status}
        errorMessage={fileEditor.errorMessage}
        saveMessage={fileEditor.saveMessage}
        isDirty={fileEditor.isDirty}
        autocompleteStatus={fileEditorAutocomplete.status}
        autocompletePreview={fileEditorAutocomplete.preview}
        autocompleteMessage={fileEditorAutocomplete.message}
        onChange={fileEditor.setValue}
        onCursorChange={fileEditor.setCursor}
        onClose={fileEditor.close}
        onSave={fileEditor.save}
        onAcceptAutocomplete={handleAcceptFileEditorAutocomplete}
        onDismissAutocomplete={fileEditorAutocomplete.dismiss}
      />

      <GitPanel
        open={gitPanelOpen}
        cwd={activeTab?.workspace.path ?? null}
        gitStatus={git.gitStatus}
        diff={git.diff}
        log={git.log}
        branches={git.branches}
        loading={git.loading}
        errorMessage={git.errorMessage}
        onRefresh={git.refresh}
        onStage={git.stage}
        onUnstage={git.unstage}
        onCommit={git.commit}
        onPush={git.push}
        onPull={git.pull}
        onViewDiff={git.viewDiff}
        onClearDiff={git.clearDiff}
        onCheckout={git.checkout}
        onClose={() => setGitPanelOpen(false)}
      />

      {promptImproverOpen ? (
        <PromptImproverSheet
          status={promptImproverStatus}
          improvedPrompt={promptImproverResult}
          errorMessage={promptImproverError}
          onApprove={handleApproveImprovedPrompt}
          onCancel={handleCancelPromptImprover}
        />
      ) : null}
    </main>
  );
}
