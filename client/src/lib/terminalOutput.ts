const ANSI_ESCAPE_PATTERN = /\u001b\[[0-?]*[ -/]*[@-~]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[@-_]/g;
const OTHER_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

export interface OutputHistoryItem {
  id: string;
  source: 'terminal';
  rawText: string;
  displayText: string;
  createdAt: number;
  order: number;
}

export interface TerminalBufferSnapshotLine {
  text: string;
  isWrapped?: boolean;
}

export interface OutputHistoryState {
  items: OutputHistoryItem[];
  pendingRawText: string;
  pendingDisplayText: string;
  nextOrder: number;
}

export const DEFAULT_OUTPUT_HISTORY_LIMIT = 5000;

export function stripAnsiSequences(value: string): string {
  return value.replace(ANSI_ESCAPE_PATTERN, '');
}

export function sanitizeTerminalText(value: string): string {
  return stripAnsiSequences(value).replace(OTHER_CONTROL_PATTERN, '');
}

export function buildOutputHistoryFromTerminalSnapshot(
  lines: readonly TerminalBufferSnapshotLine[],
  limit = DEFAULT_OUTPUT_HISTORY_LIMIT,
): OutputHistoryItem[] {
  const logicalLines = collapseWrappedTerminalLines(lines);
  const normalizedLines = compactTerminalLines(logicalLines);
  const visibleLines = normalizedLines.length > limit ? normalizedLines.slice(normalizedLines.length - limit) : normalizedLines;
  const timestamp = Date.now();

  return visibleLines.map((displayText, index) => ({
    id: `terminal-${index}`,
    source: 'terminal' as const,
    rawText: displayText,
    displayText,
    createdAt: timestamp,
    order: index,
  }));
}

export function createInitialOutputHistoryState(): OutputHistoryState {
  return {
    items: [],
    pendingRawText: '',
    pendingDisplayText: '',
    nextOrder: 0,
  };
}

export function appendOutputHistoryChunk(
  state: OutputHistoryState,
  chunk: string,
  limit = DEFAULT_OUTPUT_HISTORY_LIMIT,
): OutputHistoryState {
  if (!chunk) {
    return state;
  }

  const sanitizedChunk = sanitizeTerminalText(chunk);
  const rawSegments = splitTerminalSegments(state.pendingRawText + chunk);
  const displaySegments = splitTerminalSegments(state.pendingDisplayText + sanitizedChunk);
  const completedCount = Math.min(rawSegments.completed.length, displaySegments.completed.length);

  if (completedCount === 0) {
    return {
      ...state,
      pendingRawText: rawSegments.remainder,
      pendingDisplayText: displaySegments.remainder,
    };
  }

  const timestamp = Date.now();
  const appendedItems = rawSegments.completed.slice(0, completedCount).map((rawText, index) => ({
    id: `terminal-${state.nextOrder + index}`,
    source: 'terminal' as const,
    rawText,
    displayText: displaySegments.completed[index],
    createdAt: timestamp,
    order: state.nextOrder + index,
  }));

  const items = [...state.items, ...appendedItems];
  const trimmedItems = items.length > limit ? items.slice(items.length - limit) : items;

  return {
    items: trimmedItems,
    pendingRawText: rawSegments.remainder,
    pendingDisplayText: displaySegments.remainder,
    nextOrder: state.nextOrder + appendedItems.length,
  };
}

function splitTerminalSegments(value: string) {
  const completed: string[] = [];
  let segmentStart = 0;

  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current !== '\n' && current !== '\r') {
      continue;
    }

    completed.push(value.slice(segmentStart, index));

    if (current === '\r' && value[index + 1] === '\n') {
      index += 1;
    }

    segmentStart = index + 1;
  }

  return {
    completed,
    remainder: value.slice(segmentStart),
  };
}

function collapseWrappedTerminalLines(lines: readonly TerminalBufferSnapshotLine[]): string[] {
  const collapsed: string[] = [];

  for (const line of lines) {
    const normalizedLine = sanitizeTerminalText(line.text).replace(/\u00a0/g, ' ').trimEnd();

    if (line.isWrapped && collapsed.length > 0) {
      collapsed[collapsed.length - 1] += normalizedLine;
      continue;
    }

    collapsed.push(normalizedLine);
  }

  return collapsed;
}

function compactTerminalLines(lines: readonly string[]): string[] {
  const compacted: string[] = [];

  for (const line of lines) {
    const isBlank = line.trim().length === 0;

    if (isBlank) {
      if (compacted.length === 0 || compacted[compacted.length - 1] === '') {
        continue;
      }

      compacted.push('');
      continue;
    }

    compacted.push(line);
  }

  while (compacted[0] === '') {
    compacted.shift();
  }

  while (compacted[compacted.length - 1] === '') {
    compacted.pop();
  }

  return compacted;
}