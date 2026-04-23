import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import type { TerminalTheme } from '../utils/xtermInitializer';

export interface AppTheme {
  name: string;
  label: string;
  ui: {
    bg: string;
    bgLight: string;
    bgLighter: string;
    fg: string;
    fgMuted: string;
    accent: string;
    border: string;
    hover: string;
  };
  terminal: TerminalTheme;
}

const STORAGE_KEY = 'lumiterm_theme';

const themes: AppTheme[] = [
  {
    name: 'warp-dark',
    label: 'Warp Dark',
    ui: {
      bg: '#111113',
      bgLight: '#1c1c1e',
      bgLighter: '#252528',
      fg: '#e8e8e8',
      fgMuted: '#6e6e73',
      accent: '#5b9cf6',
      border: '#2a2a2e',
      hover: '#3a3a3e',
    },
    terminal: {
      background: '#1c1c1e',
      foreground: '#e8e8e8',
      cursor: '#5b9cf6',
      cursorAccent: '#1c1c1e',
      selectionBackground: '#3a3a3e',
      black: '#1c1c1e',       brightBlack: '#6e6e73',
      red: '#ff6b6b',         brightRed: '#ff8585',
      green: '#a6e3a1',       brightGreen: '#b8f0b3',
      yellow: '#ffd93d',      brightYellow: '#ffe066',
      blue: '#5b9cf6',        brightBlue: '#7db3ff',
      magenta: '#c792ea',     brightMagenta: '#d4a8f5',
      cyan: '#89ddff',        brightCyan: '#a3e8ff',
      white: '#c8c8c8',       brightWhite: '#ffffff',
    },
  },
  {
    name: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    ui: {
      bg: '#181825', bgLight: '#1e1e2e', bgLighter: '#262637',
      fg: '#cdd6f4', fgMuted: '#6c7086', accent: '#89b4fa',
      border: '#313244', hover: '#45475a',
    },
    terminal: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
      selectionBackground: '#45475a',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
  },
  {
    name: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    ui: {
      bg: '#dce0e8', bgLight: '#eff1f5', bgLighter: '#e6e9ef',
      fg: '#4c4f69', fgMuted: '#9ca0b0', accent: '#1e66f5',
      border: '#bcc0cc', hover: '#acb0be',
    },
    terminal: {
      background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78',
      selectionBackground: '#acb0be',
      black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
      blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#6c6f85',
      brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b',
      brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
      brightCyan: '#179299', brightWhite: '#9ca0b0',
    },
  },
  {
    name: 'dracula',
    label: 'Dracula',
    ui: {
      bg: '#1e1f29', bgLight: '#282a36', bgLighter: '#343746',
      fg: '#f8f8f2', fgMuted: '#6272a4', accent: '#bd93f9',
      border: '#44475a', hover: '#505461',
    },
    terminal: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
  },
  {
    name: 'tokyo-night',
    label: 'Tokyo Night',
    ui: {
      bg: '#1a1b26', bgLight: '#1a1b26', bgLighter: '#24283b',
      fg: '#c0caf5', fgMuted: '#565f89', accent: '#7aa2f7',
      border: '#292e42', hover: '#3b4261',
    },
    terminal: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5',
      selectionBackground: '#33467c',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
      brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
  },
  {
    name: 'nord',
    label: 'Nord',
    ui: {
      bg: '#2e3440', bgLight: '#2e3440', bgLighter: '#3b4252',
      fg: '#eceff4', fgMuted: '#d8dee9', accent: '#88c0d0',
      border: '#3b4252', hover: '#434c5e',
    },
    terminal: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#eceff4',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
  },
];

export const useThemeStore = defineStore('theme', () => {
  const currentName = ref(themes[0].name);

  function getCurrentTheme(): AppTheme {
    return themes.find((t) => t.name === currentName.value) ?? themes[0];
  }

  function setTheme(name: string) {
    if (themes.some((t) => t.name === name)) {
      currentName.value = name;
    }
  }

  function getAllThemes(): AppTheme[] {
    return themes;
  }

  // Persist theme choice
  watch(currentName, (name) => {
    try { localStorage.setItem(STORAGE_KEY, name); } catch { /* */ }
  });

  // Load persisted theme
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && themes.some((t) => t.name === saved)) {
      currentName.value = saved;
    }
  } catch { /* */ }

  return { currentName, getCurrentTheme, setTheme, getAllThemes };
});
