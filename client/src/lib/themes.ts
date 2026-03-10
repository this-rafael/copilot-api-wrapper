import type { ITheme } from '@xterm/xterm';

export type ThemeId = 'dracula' | 'vscode-light';

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  isDark: boolean;
  themeColor: string;
  cssVars: Record<string, string>;
  xterm: ITheme;
}

export const themeDefinitions: Record<ThemeId, ThemeDefinition> = {
  dracula: {
    id: 'dracula',
    label: 'Dracula',
    isDark: true,
    themeColor: '#282a36',
    cssVars: {
      '--bg-primary': '#282a36',
      '--bg-secondary': '#44475a',
      '--text-primary': '#f8f8f2',
      '--text-secondary': '#6272a4',
      '--accent': '#bd93f9',
      '--accent-secondary': '#50fa7b',
      '--accent-contrast': '#ffffff',
      '--error': '#ff5555',
      '--warning': '#f1fa8c',
      '--border': '#6272a4',
      '--surface': 'rgba(68, 71, 90, 0.82)',
      '--surface-muted': 'rgba(248, 248, 242, 0.06)',
      '--surface-strong': 'rgba(40, 42, 54, 0.96)',
      '--shadow': 'rgba(13, 14, 18, 0.45)',
      '--backdrop': 'rgba(10, 12, 18, 0.42)',
      '--orb-left': 'rgba(189, 147, 249, 0.22)',
      '--orb-right': 'rgba(80, 250, 123, 0.16)',
      '--terminal-bg': '#1f2230',
      '--terminal-border': '#6272a4',
      '--field-bg': 'rgba(248, 248, 242, 0.06)',
      '--field-focus': 'rgba(189, 147, 249, 0.28)',
    },
    xterm: {
      background: '#282a36',
      foreground: '#f8f8f2',
      cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c',
      red: '#ff5555',
      green: '#50fa7b',
      yellow: '#f1fa8c',
      blue: '#bd93f9',
      magenta: '#ff79c6',
      cyan: '#8be9fd',
      white: '#f8f8f2',
      brightBlack: '#6272a4',
      brightRed: '#ff6e6e',
      brightGreen: '#69ff94',
      brightYellow: '#ffffa5',
      brightBlue: '#d6acff',
      brightMagenta: '#ff92df',
      brightCyan: '#a4ffff',
      brightWhite: '#ffffff',
    },
  },
  'vscode-light': {
    id: 'vscode-light',
    label: 'VS Code Light',
    isDark: false,
    themeColor: '#edf3fb',
    cssVars: {
      '--bg-primary': '#edf3fb',
      '--bg-secondary': '#dde7f2',
      '--text-primary': '#1f2328',
      '--text-secondary': '#4b5563',
      '--accent': '#005fb8',
      '--accent-secondary': '#18794e',
      '--accent-contrast': '#ffffff',
      '--error': '#b42318',
      '--warning': '#a15c00',
      '--border': '#b8c6d8',
      '--surface': 'rgba(255, 255, 255, 0.82)',
      '--surface-muted': 'rgba(241, 245, 250, 0.92)',
      '--surface-strong': 'rgba(250, 252, 255, 0.96)',
      '--shadow': 'rgba(30, 41, 59, 0.16)',
      '--backdrop': 'rgba(203, 213, 225, 0.58)',
      '--orb-left': 'rgba(0, 95, 184, 0.16)',
      '--orb-right': 'rgba(24, 121, 78, 0.12)',
      '--terminal-bg': '#f7f9fc',
      '--terminal-border': '#a9b8cb',
      '--field-bg': 'rgba(244, 247, 252, 0.96)',
      '--field-focus': 'rgba(0, 95, 184, 0.18)',
    },
    xterm: {
      background: '#f7f9fc',
      foreground: '#1f2328',
      cursor: '#1f2328',
      cursorAccent: '#f7f9fc',
      selectionBackground: '#cfe2ff',
      black: '#1f2328',
      red: '#cd3131',
      green: '#18794e',
      yellow: '#a15c00',
      blue: '#005fb8',
      magenta: '#bc05bc',
      cyan: '#2aa1b3',
      white: '#5f6b7a',
      brightBlack: '#758194',
      brightRed: '#f14c4c',
      brightGreen: '#23d18b',
      brightYellow: '#8a6700',
      brightBlue: '#3b8eea',
      brightMagenta: '#d670d6',
      brightCyan: '#29b8db',
      brightWhite: '#384152',
    },
  },
};

export function setThemeColorMeta(themeId: ThemeId): void {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) {
    meta.content = themeDefinitions[themeId].themeColor;
  }
}