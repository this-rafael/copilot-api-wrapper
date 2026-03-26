import { useCallback, useEffect, useRef, useState } from 'react';

type TerminalFullscreenMode = 'off' | 'fallback' | 'native';

type ScreenOrientationController = ScreenOrientation & {
  lock?: (orientation: 'portrait' | 'landscape') => Promise<void>;
  unlock?: () => void;
};

interface UseTerminalFullscreenOptions {
  orientation: 'portrait' | 'landscape';
  onActiveChange?: (active: boolean) => void;
  onLayoutChange?: () => void;
}

function callAfterFrames(callback: () => void) {
  callback();

  if (typeof window === 'undefined') {
    return;
  }

  window.requestAnimationFrame(() => {
    callback();
    window.requestAnimationFrame(() => {
      callback();
    });
  });
}

export function useTerminalFullscreen({
  orientation,
  onActiveChange,
  onLayoutChange,
}: UseTerminalFullscreenOptions) {
  const screenRef = useRef<HTMLElement | null>(null);
  const modeRef = useRef<TerminalFullscreenMode>('off');
  const onLayoutChangeRef = useRef(onLayoutChange);
  const [mode, setMode] = useState<TerminalFullscreenMode>('off');

  onLayoutChangeRef.current = onLayoutChange;

  const setFullscreenMode = useCallback((nextMode: TerminalFullscreenMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const setScreenRef = useCallback((node: HTMLElement | null) => {
    screenRef.current = node;
  }, []);

  const enterFullscreen = useCallback(async () => {
    const screen = screenRef.current;
    if (!screen) {
      return;
    }

    setFullscreenMode('fallback');

    if (typeof document === 'undefined' || typeof screen.requestFullscreen !== 'function') {
      return;
    }

    if (document.fullscreenEnabled === false) {
      return;
    }

    try {
      await screen.requestFullscreen();
    } catch {
      return;
    }
  }, [setFullscreenMode]);

  const exitFullscreen = useCallback(async () => {
    const screen = screenRef.current;
    const shouldExitNative = typeof document !== 'undefined'
      && typeof document.exitFullscreen === 'function'
      && document.fullscreenElement === screen;

    setFullscreenMode('off');

    if (!shouldExitNative) {
      return;
    }

    try {
      await document.exitFullscreen();
    } catch {
      return;
    }
  }, [setFullscreenMode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const handleFullscreenChange = () => {
      const screen = screenRef.current;
      const isNativeFullscreen = Boolean(screen) && document.fullscreenElement === screen;

      if (isNativeFullscreen) {
        setFullscreenMode('native');
        return;
      }

      if (modeRef.current === 'native') {
        setFullscreenMode('off');
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, [setFullscreenMode]);

  useEffect(() => {
    if (typeof document === 'undefined') {
      return;
    }

    const isActive = mode !== 'off';
    document.body.classList.toggle('terminal-fullscreen-active', isActive);
    onActiveChange?.(isActive);

    return () => {
      document.body.classList.remove('terminal-fullscreen-active');
    };
  }, [mode, onActiveChange]);

  useEffect(() => {
    callAfterFrames(() => {
      onLayoutChangeRef.current?.();
    });
  }, [mode, orientation]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const orientationController = window.screen?.orientation as ScreenOrientationController | undefined;

    if (mode === 'off') {
      try {
        orientationController?.unlock?.();
      } catch {
        return;
      }

      return;
    }

    if (typeof orientationController?.lock !== 'function') {
      return;
    }

    void orientationController.lock(orientation).catch(() => undefined);

    return () => {
      try {
        orientationController.unlock?.();
      } catch {
        return;
      }
    };
  }, [mode, orientation]);

  useEffect(() => {
    return () => {
      document.body.classList.remove('terminal-fullscreen-active');

      if (typeof document !== 'undefined'
        && typeof document.exitFullscreen === 'function'
        && document.fullscreenElement === screenRef.current) {
        void document.exitFullscreen().catch(() => undefined);
      }

      try {
        window.screen?.orientation?.unlock?.();
      } catch {
        return;
      }
    };
  }, []);

  return {
    screenRef: setScreenRef,
    isFullscreen: mode !== 'off',
    isNativeFullscreen: mode === 'native',
    enterFullscreen,
    exitFullscreen,
  };
}