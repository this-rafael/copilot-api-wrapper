import { useEffect } from 'react';
import { useLocalStorage } from './useLocalStorage';
import { setThemeColorMeta, themeDefinitions, type ThemeId } from '../lib/themes';

export function useTheme() {
  const [theme, setTheme] = useLocalStorage<ThemeId>('copilot_theme', 'dracula');

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = themeDefinitions[theme].isDark ? 'dark' : 'light';
    setThemeColorMeta(theme);
  }, [theme]);

  return {
    theme,
    isDark: themeDefinitions[theme].isDark,
    themeDefinition: themeDefinitions[theme],
    toggleTheme: () => setTheme((current) => (current === 'dracula' ? 'vscode-light' : 'dracula')),
    setTheme,
  };
}