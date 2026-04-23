<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { initTerminal, type TerminalInstance } from '../utils/xtermInitializer';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore } from '../stores/fontStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import InputBar from './InputBar.vue';

const props = defineProps<{
  paneId: string;
  tabId: string;
  shellType: ShellType;
  active: boolean;
  paneActive: boolean;
}>();

const store = useTerminalStore();
const themeStore = useThemeStore();
const fontStore = useFontStore();
const shortcutsStore = useShortcutsStore();

// ── Pane close button ──
const showCloseButton = computed(() => {
  const tab = store.tabs.find((t) => t.id === props.tabId);
  return !!tab && tab.panes.length > 1;
});

function handleClose() {
  const tab = store.tabs.find((t) => t.id === props.tabId);
  const nextPane = tab?.panes.find((p) => p.id !== props.paneId);
  store.closePane(props.tabId, props.paneId);
  if (nextPane) {
    window.dispatchEvent(new CustomEvent('lumiterm:focus-pane', {
      detail: { tabId: props.tabId, paneId: nextPane.id },
    }));
  }
}

// ── Terminal refs ──
const terminalRef = ref<HTMLElement | null>(null);
const inputBarRef = ref<InstanceType<typeof InputBar> | null>(null);
let instance: TerminalInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let inputBarObserver: ResizeObserver | null = null;
let isMounted = true;
let contextMenuCleanup: (() => void) | null = null;

// ── Warp-style state ──
const sessionId = ref<string | null>(null);
const isInteractiveMode = ref(false);
const cwd = ref('');
const gitBranch = ref('');

// ── Right-click context menu ──
const contextMenu = ref<{ x: number; y: number } | null>(null);
const hasTerminalSelection = ref(false);

function closeContextMenu() {
  contextMenu.value = null;
}

async function handleCopy() {
  const selection = instance?.terminal.getSelection();
  if (selection) {
    await navigator.clipboard.writeText(selection).catch(() => {});
    instance?.terminal.clearSelection();
  }
  closeContextMenu();
}

async function handlePaste() {
  const text = await navigator.clipboard.readText().catch(() => '');
  if (text) {
    if (isInteractiveMode.value && sessionId.value) {
      instance?.terminal.paste(text);
    } else {
      inputBarRef.value?.fillCommand(text);
    }
  }
  closeContextMenu();
}

function handleCut() {
  handleCopy(); // terminal cut = copy (no delete)
}

// ── Git branch fetch ──
async function fetchGitBranch(path: string) {
  if (!path) { gitBranch.value = ''; return; }
  try {
    gitBranch.value = await invoke<string>('get_git_branch', { path });
  } catch {
    gitBranch.value = '';
  }
}

// ── Shell commands ──
const shellCommands: Record<ShellType, string> = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  wsl2: 'wsl.exe',
};

// ── OSC 7 parser ──
function parseOsc7(text: string): string | null {
  // Matches \x1b]7;file://hostname/path\x07  or  \x1b]7;file://hostname/path\x1b\\
  const m = text.match(/\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/);
  if (!m || m[1].length > 4096) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// ── Main init ──
async function init(container: HTMLElement) {
  instance = initTerminal(container, themeStore.getCurrentTheme().terminal, {
    fontFamily: fontStore.fontFamily,
    fontSize: fontStore.fontSize,
    lineHeight: fontStore.lineHeight,
  });
  const { terminal, fitAddon } = instance;

  // ── PTY output handler ──
  const channel = new Channel<number[]>();
  channel.onmessage = (rawData) => {
    const bytes = new Uint8Array(rawData);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // Interactive mode detection (alternate screen buffer)
    if (text.includes('\x1b[?1049h')) {
      isInteractiveMode.value = true;
      nextTick(() => { terminal.focus(); fitAddon.fit(); });
    }
    if (text.includes('\x1b[?1049l')) {
      isInteractiveMode.value = false;
      nextTick(() => { inputBarRef.value?.focus(); fitAddon.fit(); });
    }

    // OSC 7: current working directory
    const newCwd = parseOsc7(text);
    if (newCwd && newCwd !== cwd.value) {
      cwd.value = newCwd;
      fetchGitBranch(newCwd);
    }

    terminal.write(bytes);
  };

  // ── Spawn PTY ──
  try {
    const sid = await invoke<string>('create_pty', {
      shell: shellCommands[props.shellType],
      cols: terminal.cols,
      rows: terminal.rows,
      channel,
    });
    sessionId.value = sid;
    store.setPaneSessionId(props.tabId, props.paneId, sid);
  } catch (e) {
    terminal.write(`\r\nFailed to start shell: ${e}\r\n`);
    return;
  }

  // ── Focus tracking ──
  terminal.element?.addEventListener('focus', () => {
    store.setActivePane(props.tabId, props.paneId);
    // In normal mode, redirect focus back to InputBar
    if (!isInteractiveMode.value) {
      nextTick(() => inputBarRef.value?.focus());
    }
  });

  // ── Right-click menu ──
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    hasTerminalSelection.value = !!terminal.hasSelection();
    contextMenu.value = { x: e.clientX, y: e.clientY };
  };
  container.addEventListener('contextmenu', onContextMenu);
  contextMenuCleanup = () => container.removeEventListener('contextmenu', onContextMenu);

  // ── Keyboard filter ──
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;

    // In interactive mode: pass through everything except app-level shortcuts
    if (isInteractiveMode.value) {
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false;
      if (e.ctrlKey && e.key === 'Tab') return false;
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'E' || e.key === 'W')) return false;
      if (e.key === 'F2') return false;
      return true;
    }

    // In normal mode: block all keyboard input to xterm (InputBar handles it)
    return false;
  });

  // ── PTY write (interactive mode only) ──
  terminal.onData((data) => {
    if (!sessionId.value || !isInteractiveMode.value) return;
    invoke('write_pty_cmd', {
      sessionId: sessionId.value,
      data: Array.from(new TextEncoder().encode(data)),
    }).catch(() => {});
  });

  // ── Resize/padding observer ──
  // Single applyPadding path: sets .xterm paddingBottom = InputBar height,
  // then fits, then resizes PTY. Both container resize and InputBar height
  // changes go through this function to avoid double-fit.
  const xtermEl = container.querySelector('.xterm') as HTMLElement | null;
  await nextTick(); // ensure InputBar is mounted before querying
  const inputBarEl = inputBarRef.value?.$el as HTMLElement | null;
  if (!inputBarEl) {
    console.warn('[TerminalPane] inputBarEl not found after nextTick — xterm padding not set');
  }
  const applyPadding = () => {
    if (!isMounted) return;
    const h = inputBarEl ? inputBarEl.offsetHeight : 0;
    if (xtermEl) xtermEl.style.paddingBottom = h + 'px';
    fitAddon.fit();
    if (sessionId.value) {
      invoke('resize_pty_cmd', {
        sessionId: sessionId.value,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {});
    }
  };
  resizeObserver = new ResizeObserver(applyPadding);
  resizeObserver.observe(container);
  if (inputBarEl) {
    inputBarObserver = new ResizeObserver(applyPadding);
    inputBarObserver.observe(inputBarEl);
  }

  // Auto-focus InputBar after init
  nextTick(() => inputBarRef.value?.focus());
}

// ── Watchers ──
watch(() => themeStore.currentName, () => {
  if (instance) instance.terminal.options.theme = themeStore.getCurrentTheme().terminal;
});

watch([() => fontStore.fontFamily, () => fontStore.fontSize, () => fontStore.lineHeight], () => {
  if (instance) {
    instance.terminal.options.fontFamily = `"${fontStore.fontFamily}", Consolas, monospace`;
    instance.terminal.options.fontSize = fontStore.fontSize;
    instance.terminal.options.lineHeight = fontStore.lineHeight;
    instance.fitAddon.fit();
  }
});

watch(
  [() => props.active, () => props.paneActive],
  ([tabActive, paneActive]) => {
    if (tabActive && paneActive && instance) {
      setTimeout(() => {
        instance!.fitAddon.fit();
        if (!isInteractiveMode.value) inputBarRef.value?.focus();
      }, 50);
    }
  }
);

// Close context menu on outside click
function handleGlobalClick() {
  if (contextMenu.value) closeContextMenu();
}

function handleFocusPane(e: Event) {
  const { tabId, paneId } = (e as CustomEvent).detail;
  if (tabId === props.tabId && paneId === props.paneId && instance) {
    if (isInteractiveMode.value) instance.terminal.focus();
    else inputBarRef.value?.focus();
  }
}

// Handle copy/paste/cut events from App.vue
function handleTerminalCopy() { if (props.active && props.paneActive) handleCopy(); }
function handleTerminalPaste() { if (props.active && props.paneActive) handlePaste(); }
function handleTerminalCut() { if (props.active && props.paneActive) handleCut(); }

onMounted(() => {
  if (terminalRef.value) init(terminalRef.value);
  window.addEventListener('lumiterm:focus-pane', handleFocusPane);
  window.addEventListener('lumiterm:copy', handleTerminalCopy);
  window.addEventListener('lumiterm:paste', handleTerminalPaste);
  window.addEventListener('lumiterm:cut', handleTerminalCut);
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  isMounted = false;
  window.removeEventListener('lumiterm:focus-pane', handleFocusPane);
  window.removeEventListener('lumiterm:copy', handleTerminalCopy);
  window.removeEventListener('lumiterm:paste', handleTerminalPaste);
  window.removeEventListener('lumiterm:cut', handleTerminalCut);
  document.removeEventListener('click', handleGlobalClick);
  contextMenuCleanup?.();
  resizeObserver?.disconnect();
  inputBarObserver?.disconnect();
  if (sessionId.value) invoke('close_pty_cmd', { sessionId: sessionId.value }).catch(() => {});
  instance?.dispose();
});
</script>

<template>
  <div
    class="pane-wrapper"
    :style="{ display: active ? 'block' : 'none' }"
  >
    <button
      v-if="showCloseButton"
      class="pane-close-btn"
      title="关闭分屏"
      @click.stop="handleClose"
    >×</button>

    <div
      ref="terminalRef"
      class="terminal-container"
      :class="{ 'pane-active': paneActive }"
      :style="{ background: themeStore.getCurrentTheme().terminal.background }"
    />

    <InputBar
      ref="inputBarRef"
      :session-id="sessionId"
      :is-interactive="isInteractiveMode"
      :cwd="cwd"
      :git-branch="gitBranch"
    />

    <!-- Right-click context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="terminal-ctx-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div
          class="ctx-item"
          :class="{ disabled: !hasTerminalSelection }"
          @click="hasTerminalSelection && handleCopy()"
        >
          复制
          <span class="ctx-hint">{{ shortcutsStore.getKey('copy') }}</span>
        </div>
        <div class="ctx-item" @click="handlePaste()">
          粘贴
          <span class="ctx-hint">{{ shortcutsStore.getKey('paste') }}</span>
        </div>
        <div
          class="ctx-item"
          :class="{ disabled: !hasTerminalSelection }"
          @click="hasTerminalSelection && handleCut()"
        >
          剪切
          <span class="ctx-hint">{{ shortcutsStore.getKey('cut') }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.pane-wrapper {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
}

.terminal-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.terminal-container.pane-active {
  box-shadow: inset 0 0 0 1px var(--ui-accent);
}

.pane-close-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 100;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.pane-wrapper:hover .pane-close-btn {
  opacity: 1;
  pointer-events: auto;
}

.pane-close-btn:hover {
  background: rgba(220, 50, 50, 0.8);
}
</style>

<!-- Global styles for context menu (not scoped - teleported to body) -->
<style>
.terminal-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-family: system-ui, sans-serif;
  font-size: 12px;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  color: var(--ui-fg);
  cursor: pointer;
  gap: 16px;
}

.ctx-item:hover:not(.disabled) {
  background: var(--ui-hover);
}

.ctx-item.disabled {
  color: var(--ui-fg-muted);
  cursor: default;
}

.ctx-hint {
  color: var(--ui-fg-muted);
  font-size: 10px;
}
</style>
