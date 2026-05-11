import { Terminal } from '@xterm/xterm';
import { WebglAddon } from '@xterm/addon-webgl';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}

export interface TerminalInstance {
  terminal: Terminal;
  fitAddon: FitAddon;
  dispose: () => void;
}

export interface FontOptions {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
}

export interface InitOptions {
  transparent?: boolean;
}

export function initTerminal(
  container: HTMLElement,
  theme?: TerminalTheme,
  font?: FontOptions,
  options?: InitOptions,
): TerminalInstance {
  // WebGL renderer ignores allowTransparency, so when glass effect is on we
  // override the theme background to fully transparent and skip WebGL.
  const effectiveTheme = options?.transparent && theme
    ? { ...theme, background: 'rgba(0,0,0,0)' }
    : theme;

  const terminal = new Terminal({
    fontFamily: font?.fontFamily
      ? `"${font.fontFamily}", Consolas, monospace`
      : '"Cascadia Code", Consolas, monospace',
    fontSize: font?.fontSize ?? 13,
    lineHeight: font?.lineHeight ?? 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    allowTransparency: true,
    scrollback: 10000,
    theme: effectiveTheme,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  terminal.open(container);

  // xterm sets viewport's backgroundColor via JS after open(); clear it so
  // the canvas renderer can show through when transparency is requested.
  if (options?.transparent) {
    const viewport = container.querySelector<HTMLElement>('.xterm-viewport');
    if (viewport) viewport.style.backgroundColor = 'transparent';
  }

  if (!options?.transparent) {
    try {
      const webglAddon = new WebglAddon();
      webglAddon.onContextLoss(() => webglAddon.dispose());
      terminal.loadAddon(webglAddon);
    } catch {
      // Canvas renderer is used as fallback
    }
  }

  fitAddon.fit();

  return {
    terminal,
    fitAddon,
    dispose: () => terminal.dispose(),
  };
}
