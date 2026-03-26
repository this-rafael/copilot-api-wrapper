import { useCallback, useEffect, useMemo, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { LigaturesAddon } from '@xterm/addon-ligatures';
import { WebglAddon } from '@xterm/addon-webgl';
import type { ThemeDefinition } from '../lib/themes';
import { buildOutputHistoryFromTerminalSnapshot, DEFAULT_OUTPUT_HISTORY_LIMIT } from '../lib/terminalOutput';

const TERMINAL_FONT_FAMILY = '"FiraCode Nerd Font Mono", "FiraCode Nerd Font", monospace';
const TERMINAL_FONT_FEATURE_SETTINGS = '"calt" 1, "liga" 1, "dlig" 1';

export function useTerminal(theme: ThemeDefinition, fontSize: number) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const ligaturesAddonRef = useRef<LigaturesAddon | null>(null);
  const mountedRef = useRef(false);
  const minimumContrastRatio = theme.isDark ? 1 : 4.5;

  const refreshTerminalMetrics = useCallback(() => {
    if (!terminalRef.current) {
      return;
    }

    terminalRef.current.options.fontFamily = TERMINAL_FONT_FAMILY;
    fitAddonRef.current?.fit();
  }, []);

  // Create Terminal instance once (no DOM attachment yet)
  useEffect(() => {
    const terminal = new Terminal({
      convertEol: true,
      cursorBlink: true,
      allowProposedApi: true,
      fontFamily: TERMINAL_FONT_FAMILY,
      fontSize,
      theme: theme.xterm,
      scrollback: 5000,
      allowTransparency: false,
      minimumContrastRatio,
    });
    const fitAddon = new FitAddon();

    terminal.loadAddon(fitAddon);
    try {
      terminal.loadAddon(new WebglAddon());
    } catch {
      // Keep the terminal usable on devices where WebGL is unavailable.
    }

    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;
    ligaturesAddonRef.current = new LigaturesAddon({
      fontFeatureSettings: TERMINAL_FONT_FEATURE_SETTINGS,
    });
    mountedRef.current = false;

    return () => {
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      ligaturesAddonRef.current = null;
      mountedRef.current = false;
    };
  }, []);

  // Attach terminal to container via ref callback
  const setContainerRef = useCallback((node: HTMLDivElement | null) => {
    containerRef.current = node;
    if (node && terminalRef.current && !mountedRef.current) {
      terminalRef.current.open(node);
      terminalRef.current.loadAddon(ligaturesAddonRef.current ?? new LigaturesAddon({
        fontFeatureSettings: TERMINAL_FONT_FEATURE_SETTINGS,
      }));
      refreshTerminalMetrics();

      if (typeof document !== 'undefined' && 'fonts' in document) {
        void document.fonts.ready.then(() => {
          refreshTerminalMetrics();
        });
      }

      mountedRef.current = true;
    }
  }, [refreshTerminalMetrics]);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = theme.xterm;
      terminalRef.current.options.fontFamily = TERMINAL_FONT_FAMILY;
      terminalRef.current.options.fontSize = fontSize;
      terminalRef.current.options.minimumContrastRatio = minimumContrastRatio;
      fitAddonRef.current?.fit();
    }
  }, [fontSize, minimumContrastRatio, theme]);

  const write = useCallback((data: string, onWriteComplete?: () => void) => {
    if (!terminalRef.current) {
      onWriteComplete?.();
      return;
    }

    terminalRef.current.write(data, () => {
      onWriteComplete?.();
    });
  }, []);

  const clear = useCallback(() => {
    terminalRef.current?.clear();
  }, []);

  const reset = useCallback(() => {
    terminalRef.current?.reset();
  }, []);

  const fit = useCallback(() => {
    fitAddonRef.current?.fit();
  }, []);

  const readOutputHistory = useCallback((limit = DEFAULT_OUTPUT_HISTORY_LIMIT) => {
    const terminal = terminalRef.current;
    if (!terminal) {
      return [];
    }

    const buffer = terminal.buffer.active;
    const snapshotStart = Math.max(0, buffer.length - (limit * 4));
    const lines = [];

    for (let index = snapshotStart; index < buffer.length; index += 1) {
      const line = buffer.getLine(index);
      if (!line) {
        continue;
      }

      lines.push({
        text: line.translateToString(false),
        isWrapped: 'isWrapped' in line ? Boolean(line.isWrapped) : false,
      });
    }

    return buildOutputHistoryFromTerminalSnapshot(lines, limit);
  }, []);

  const getSize = useCallback(() => {
    return {
      cols: terminalRef.current?.cols ?? 80,
      rows: terminalRef.current?.rows ?? 24,
    };
  }, []);

  return useMemo(() => ({
    containerRef: setContainerRef,
    write,
    clear,
    reset,
    fit,
    readOutputHistory,
    getSize,
  }), [clear, fit, getSize, readOutputHistory, reset, setContainerRef, write]);
}