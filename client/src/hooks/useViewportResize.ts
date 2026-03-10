import { useEffect } from 'react';

export function useViewportResize(callback: () => void) {
  useEffect(() => {
    const viewport = window.visualViewport;
    const listener = () => callback();

    viewport?.addEventListener('resize', listener);
    window.addEventListener('resize', listener);

    return () => {
      viewport?.removeEventListener('resize', listener);
      window.removeEventListener('resize', listener);
    };
  }, [callback]);
}