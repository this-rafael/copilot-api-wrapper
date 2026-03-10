import { useEffect, useState } from 'react';
import type { CommandCatalogItem } from '../lib/commandCatalog';
import type { OutputHistoryItem } from '../lib/terminalOutput';
import type { ContextSearchItem } from '../lib/protocol';
import type { ThemeDefinition } from '../lib/themes';
import type { MentionSearchStatus } from '../hooks/useMentionSearch';
import { CopyOutputSheet } from './CopyOutputSheet';
import { CommandPicker } from './CommandPicker';
import { Header } from './Header';
import { InputBar } from './InputBar';
import { MentionSearchSheet } from './MentionSearchSheet';
import { QuickActions } from './QuickActions';
import { StatusBanner } from './StatusBanner';
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
  mentionItems: ContextSearchItem[];
  mentionOpen: boolean;
  onMentionQueryChange: (value: string) => void;
  onInputChange: (value: string, cursor: number) => void;
  onInputCursorChange: (cursor: number) => void;
  onSend: () => void;
  onQuickAction: (value: string) => void;
  onToggleCommands: () => void;
  onToggleRawMode: () => void;
  onCloseSession: () => void;
  onToggleTheme: () => void;
  commandPickerOpen: boolean;
  onCloseCommandPicker: () => void;
  onSelectCommand: (item: CommandCatalogItem) => void;
  onCloseMentionSheet: () => void;
  onSelectMentionItem: (item: ContextSearchItem) => void;
  fontSize: number;
  onIncreaseFont: () => void;
  onDecreaseFont: () => void;
}

export function TerminalScreen(props: TerminalScreenProps) {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [copySheetOpen, setCopySheetOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

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

  const tone = props.socketStatus === 'open'
    ? 'online'
    : props.socketStatus === 'reconnecting'
      ? 'warning'
      : 'error';

  return (
    <section className="terminal-screen card-shell">
      <Header
        connectionTone={tone}
        themeLabel={props.theme.id === 'dracula' ? '☀' : '☾'}
        onToggleTheme={props.onToggleTheme}
        onEndSession={() => {
          if (showEndConfirm) {
            props.onCloseSession();
            setShowEndConfirm(false);
            return;
          }
          setShowEndConfirm(true);
        }}
      />
      <div className="terminal-toolbar">
        <button type="button" className="ghost-button" onClick={props.onDecreaseFont}>
          A-
        </button>
        <span>{props.fontSize}px</span>
        <button type="button" className="ghost-button" onClick={props.onIncreaseFont}>
          A+
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => setCopySheetOpen(true)}
          disabled={!props.outputHistoryHasContent}
          aria-label="Abrir popup para copiar linhas do output"
        >
          Copiar
        </button>
        {showEndConfirm ? <span className="warning-pill">Toque novamente para encerrar</span> : null}
        {copyFeedback ? <span className="status-pill">{copyFeedback}</span> : null}
      </div>
      <TerminalView containerRef={props.terminal.containerRef} />
      <QuickActions onSend={props.onQuickAction} disabled={props.sessionStatus !== 'active'} />
      <InputBar
        value={props.inputValue}
        cursor={props.inputCursor}
        rawMode={props.rawMode}
        disabled={props.sessionStatus !== 'active'}
        onChange={props.onInputChange}
        onCursorChange={props.onInputCursorChange}
        onSend={props.onSend}
        onToggleCommands={props.onToggleCommands}
        onToggleRawMode={props.onToggleRawMode}
      />

      {props.sessionStatus === 'creating' && !props.sessionError ? (
        <StatusBanner
          tone="neutral"
          message="Aguardando o prompt do Copilot para liberar entrada..."
        />
      ) : null}

      {props.sessionError ? (
        <StatusBanner
          tone={props.sessionStatus === 'disconnected' ? 'warning' : 'error'}
          message={props.sessionError}
        />
      ) : null}

      <CommandPicker
        open={props.commandPickerOpen}
        onClose={props.onCloseCommandPicker}
        onSelect={props.onSelectCommand}
      />

      <MentionSearchSheet
        open={props.mentionOpen}
        items={props.mentionItems}
        status={props.mentionStatus}
        query={props.mentionQuery}
        onQueryChange={props.onMentionQueryChange}
        onSelect={props.onSelectMentionItem}
        onClose={props.onCloseMentionSheet}
      />

      <CopyOutputSheet
        open={copySheetOpen}
        items={props.outputHistoryItems}
        onClose={() => setCopySheetOpen(false)}
        onCopySuccess={(item) => setCopyFeedback(item.displayText ? 'Linha copiada' : 'Linha vazia copiada')}
        onCopyError={(message) => setCopyFeedback(message)}
      />
    </section>
  );
}