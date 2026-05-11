import type { TerminalTheme } from '../utils/xtermInitializer';

export interface AppThemeUi {
  bg: string;
  bgLight: string;
  bgLighter: string;
  menuBg: string;
  menuBorder: string;
  menuHover: string;
  fg: string;
  fgMuted: string;
  accent: string;
  border: string;
  hover: string;
}

export interface AppTheme {
  name: string;
  label: string;
  /** "darker" = 深色主题, "lighter" = 浅色主题 */
  variant: 'darker' | 'lighter';
  ui: AppThemeUi;
  terminal: TerminalTheme;
  /** 与 ui.bg / terminal.background 对应的 "r, g, b" 字符串，用于 rgba() */
  rgb: {
    uiBg: string;
    terminalBg: string;
  };
}

export type { TerminalTheme };
