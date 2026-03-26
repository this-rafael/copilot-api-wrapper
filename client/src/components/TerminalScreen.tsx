import { useEffect, useState } from 'react';
import type { CommandCatalogItem } from '../lib/commandCatalog';
import type { OutputHistoryItem } from '../lib/terminalOutput';
import type { ContextSearchItem, CopilotResourceItem } from '../lib/protocol';
import type { ThemeDefinition } from '../lib/themes';
import type { PromptAutocompleteState } from '../hooks/usePromptAutocomplete';
import type { MentionSearchStatus } from '../hooks/useMentionSearch';
import { CopilotResourcePicker } from './CopilotResourcePicker';
import { CopyOutputSheet } from './CopyOutputSheet';
import { CommandPicker } from './CommandPicker';
import { Header } from './Header';
import { useTerminalFullscreen } from '../hooks/useTerminalFullscreen';
import { InputBar } from './InputBar';
import { MentionSearchSheet } from './MentionSearchSheet';
import { QuickActions } from './QuickActions';
import { SessionDrawer } from './SessionDrawer';
import { StatusBanner } from './StatusBanner';
import { TerminalToolsSheet } from './TerminalToolsSheet';
import { TerminalView } from './TerminalView';

interface TerminalApi {
  containerRef: (node: HTMLDivElement | null) => void;
}

interface TerminalScreenProps {
  terminal: TerminalApi;
  theme: ThemeDefinition;
  socketStatus: 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';
  sessionStatus: 'idle' | 'creating' | 'active' | 'closed' | 'error' | 'disconnected';
  sessionError: string | null;
  outputHistoryItems: OutputHistoryItem[];
  outputHistoryHasContent: boolean;
  mentionQuery: string;
  mentionStatus: MentionSearchStatus;
  inputValue: string;
  inputCursor: number;
  rawMode: boolean;
  autocompleteStatus: PromptAutocompleteState;
  autocompletePreview: string | null;
  autocompleteMessage: string | null;
  mentionItems: ContextSearchItem[];
  mentionOpen: boolean;
  onMentionQueryChange: (value: string) => void;
  onInputChange: (value: string, cursor: number) => void;
  onInputCursorChange: (cursor: number) => void;
  onSend: () => void;
  onAcceptAutocomplete: () => void;
  onDismissAutocomplete: () => void;
  onQuickAction: (value: string) => void;
  onOpenFiles: () => void;
  onOpenGit?: () => void;
  onToggleCommands: () => void;
  onToggleCopilotResources?: () => void;
  onToggleRawMode: () => void;
  onCloseSession: () => void;
  onToggleTheme: () => void;
  commandPickerOpen: boolean;
  copilotResourcePickerOpen?: boolean;
  onCloseCommandPicker: () => void;
  onCloseCopilotResourcePicker?: () => void;
  onSelectCommand: (item: CommandCatalogItem) => void;
  copilotResourceItems?: CopilotResourceItem[];
  copilotResourceError?: string | null;
  copilotResourceLoading?: boolean;
  onReloadCopilotResources?: () => void;
  onSelectCopilotResource?: (item: CopilotResourceItem) => void;
  onCloseMentionSheet: () => void;
  onSelectMentionItem: (item: ContextSearchItem) => void;
  fontSize: number;
  outputOrientation: 'portrait' | 'landscape';
  onToggleOutputOrientation: () => void;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
  onFullscreenChange: (active: boolean) => void;
  onTerminalViewportChange: () => void;
  sessionTabs: Array<{
    id: string;
    label: string;
    path: string;
    status: 'idle' | 'creating' | 'active' | 'closed' | 'error' | 'disconnected';
    active: boolean;
    hasDraft: boolean;
  }>;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: () => void;
  onCloseSessionTab: (sessionId: string) => void;
  promptImproveStatus?: 'idle' | 'loading';
  onPromptImprove?: () => void;
}

export function TerminalScreen(props: TerminalScreenProps) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [sessionDrawerOpen, setSessionDrawerOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [toolbarMenuOpen, setToolbarMenuOpen] = useState(false);
  const closeCopilotResourcePicker = props.onCloseCopilotResourcePicker ?? (() => undefined);
  const toggleCopilotResources = props.onToggleCopilotResources ?? (() => undefined);
  const reloadCopilotResources = props.onReloadCopilotResources ?? (() => undefined);
  const selectCopilotResource = props.onSelectCopilotResource ?? (() => undefined);
  const {
    screenRef,
    isFullscreen,
    isNativeFullscreen,
    enterFullscreen,
    exitFullscreen,
  } = useTerminalFullscreen({
    orientation: props.outputOrientation,
    onActiveChange: props.onFullscreenChange,
    onLayoutChange: props.onTerminalViewportChange,
  });

  useEffect(() => {
    if (!showEndConfirm) {
      return;
    }

    const handle = window.setTimeout(() => setShowEndConfirm(false), 1800);
    return () => window.clearTimeout(handle);
  }, [showEndConfirm]);

  useEffect(() => {
    if (!copyFeedback) {
      return;
    }

    const handle = window.setTimeout(() => setCopyFeedback(null), 1800);
    return () => window.clearTimeout(handle);
  }, [copyFeedback]);

  useEffect(() => {
    if (props.sessionStatus === 'idle') {
      setCopySheetOpen(false);
      setCopyFeedback(null);
    }
  }, [props.sessionStatus]);

  useEffect(() => {
    if (!isFullscreen) {
      return;
    }

    setShowEndConfirm(false);
    setCopySheetOpen(false);
    setSessionDrawerOpen(false);
    setCopyFeedback(null);
    setToolbarMenuOpen(false);
    props.onCloseCommandPicker();
    closeCopilotResourcePicker();
    props.onCloseMentionSheet();
  }, [closeCopilotResourcePicker, isFullscreen, props.onCloseCommandPicker, props.onCloseMentionSheet]);

  const tone = props.socketStatus === 'open'
    ? 'online'
    : props.socketStatus === 'reconnecting'
      ? 'warning'
      : 'error';
  const activeSession = props.sessionTabs.find((session) => session.active) ?? props.sessionTabs[0] ?? null;

  function handleEndSessionRequest() {
    if (showEndConfirm) {
      props.onCloseSession();
      setShowEndConfirm(false);
      setSessionDrawerOpen(false);
      return;
    }

    setShowEndConfirm(true);
  }

  return (
    <section
      ref={screenRef}
      className={[
        'terminal-screen',
        'card-shell',
        `terminal-screen--${props.outputOrientation}`,
        isFullscreen ? 'terminal-screen--fullscreen' : '',
        isNativeFullscreen ? 'terminal-screen--fullscreen-native' : '',
      ].filter(Boolean).join(' ')}
    >
      {!isFullscreen ? (
        <>
          <Header
            activeSessionLabel={activeSession?.label ?? 'Sem sessão'}
            connectionTone={tone}
            themeLabel={props.theme.id === 'dracula' ? '☀' : '☾'}
            sessionCount={props.sessionTabs.length}
            filesDisabled={props.sessionStatus !== 'active'}
            onOpenFiles={props.onOpenFiles}
            onOpenGit={props.onOpenGit}
            onOpenSessionDrawer={() => setSessionDrawerOpen(true)}
            onToggleTheme={props.onToggleTheme}
            onEndSession={handleEndSessionRequest}
          />
          <div className="terminal-toolbar">
            {(showEndConfirm || copyFeedback) ? (
              <div className="toolbar-status">
                {showEndConfirm ? <span className="warning-pill">Toque novamente para encerrar</span> : null}
                {copyFeedback ? <span className="status-pill">{copyFeedback}</span> : null}
              </div>
            ) : null}
            <button
              type="button"
              className="ghost-button toolbar-menu-trigger"
              onClick={() => setToolbarMenuOpen(true)}
              aria-expanded={toolbarMenuOpen}
              aria-label="Ferramentas do terminal"
            >
              ···
            </button>
          </div>
        </>
      ) : null}

      {isFullscreen ? (
        <div className="terminal-fullscreen-controls">
          <button
            type="button"
            className="ghost-button terminal-fullscreen-control"
            onClick={() => void exitFullscreen()}
            aria-label="Sair da tela cheia do terminal"
          >
            Sair
          </button>
          <button
            type="button"
            className={`ghost-button output-orientation-toggle output-orientation-toggle--${props.outputOrientation} terminal-fullscreen-control`}
            onClick={props.onToggleOutputOrientation}
            aria-label={`Alternar visualizacao do terminal. Atual: ${props.outputOrientation}`}
          >
            <span>Output</span>
            <strong>{props.outputOrientation === 'portrait' ? 'Portrait' : 'Landscape'}</strong>
          </button>
        </div>
      ) : null}

      <TerminalView
        containerRef={props.terminal.containerRef}
        orientation={props.outputOrientation}
        fullscreen={isFullscreen}
      />

      {!isFullscreen ? (
        <QuickActions onSend={props.onQuickAction} disabled={props.sessionStatus !== 'active'} />
      ) : null}
      {!isFullscreen ? (
        <InputBar
          value={props.inputValue}
          cursor={props.inputCursor}
          rawMode={props.rawMode}
          disabled={props.sessionStatus !== 'active'}
          autocompleteStatus={props.autocompleteStatus}
          autocompletePreview={props.autocompletePreview}
          autocompleteMessage={props.autocompleteMessage}
          onChange={props.onInputChange}
          onCursorChange={props.onInputCursorChange}
          onSend={props.onSend}
          onAcceptAutocomplete={props.onAcceptAutocomplete}
          onDismissAutocomplete={props.onDismissAutocomplete}
          onToggleCommands={props.onToggleCommands}
          onToggleCopilotResources={toggleCopilotResources}
          onToggleRawMode={props.onToggleRawMode}
          promptImproveStatus={props.promptImproveStatus}
          onPromptImprove={props.onPromptImprove}
        />
      ) : null}

      {!isFullscreen && props.sessionStatus === 'creating' && !props.sessionError ? (
        <StatusBanner
          tone="neutral"
          message="Aguardando o prompt do Copilot para liberar entrada..."
        />
      ) : null}

      {!isFullscreen && props.sessionError ? (
        <StatusBanner
          tone={props.sessionStatus === 'disconnected' ? 'warning' : 'error'}
          message={props.sessionError}
        />
      ) : null}

      <CommandPicker
        open={!isFullscreen && props.commandPickerOpen}
        onClose={props.onCloseCommandPicker}
        onSelect={props.onSelectCommand}
      />

      <CopilotResourcePicker
        open={!isFullscreen && Boolean(props.copilotResourcePickerOpen)}
        items={props.copilotResourceItems}
        errorMessage={props.copilotResourceError}
        isLoading={props.copilotResourceLoading}
        onClose={closeCopilotResourcePicker}
        onReload={reloadCopilotResources}
        onSelect={selectCopilotResource}
      />

      <MentionSearchSheet
        open={!isFullscreen && props.mentionOpen}
        items={props.mentionItems}
        status={props.mentionStatus}
        query={props.mentionQuery}
        onQueryChange={props.onMentionQueryChange}
        onSelect={props.onSelectMentionItem}
        onClose={props.onCloseMentionSheet}
      />

      <CopyOutputSheet
        open={!isFullscreen && copySheetOpen}
        items={props.outputHistoryItems}
        onClose={() => setCopySheetOpen(false)}
        onCopySuccess={(item) => setCopyFeedback(item.displayText ? 'Linha copiada' : 'Linha vazia copiada')}
        onCopyError={(message) => setCopyFeedback(message)}
      />

      <TerminalToolsSheet
        open={!isFullscreen && toolbarMenuOpen}
        fontSize={props.fontSize}
        outputHistoryHasContent={props.outputHistoryHasContent}
        outputOrientation={props.outputOrientation}
        onClose={() => setToolbarMenuOpen(false)}
        onIncreaseFont={props.onIncreaseFont}
        onDecreaseFont={props.onDecreaseFont}
        onOpenCopyOutput={() => setCopySheetOpen(true)}
        onToggleOutputOrientation={props.onToggleOutputOrientation}
        onEnterFullscreen={() => void enterFullscreen()}
      />

      <SessionDrawer
        open={!isFullscreen && sessionDrawerOpen}
        confirmEndSession={showEndConfirm}
        filesDisabled={props.sessionStatus !== 'active'}
        fontSize={props.fontSize}
        outputHistoryHasContent={props.outputHistoryHasContent}
        outputOrientation={props.outputOrientation}
        sessions={props.sessionTabs}
        onClose={() => setSessionDrawerOpen(false)}
        onOpenFiles={props.onOpenFiles}
        onOpenGit={props.onOpenGit}
        onOpenCopyOutput={() => setCopySheetOpen(true)}
        onCreateSession={props.onCreateSession}
        onSelectSession={props.onSelectSession}
        onEndSession={handleEndSessionRequest}
        onCloseSessionTab={props.onCloseSessionTab}
        onToggleTheme={props.onToggleTheme}
        onIncreaseFont={props.onIncreaseFont}
        onDecreaseFont={props.onDecreaseFont}
        onToggleOutputOrientation={props.onToggleOutputOrientation}
        onEnterFullscreen={() => void enterFullscreen()}
        themeLabel={props.theme.id === 'dracula' ? '☀' : '☾'}
      />
    </section>
  );
}
