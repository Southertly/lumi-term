<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { initTerminal, type TerminalInstance } from '../utils/xtermInitializer';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore } from '../stores/fontStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import { OscParser } from '../utils/oscParser';
import { useCommandBlockStore } from '../stores/commandBlockStore';
import CommandStatusBar from './CommandStatusBar.vue';

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
const blockStore = useCommandBlockStore();
const oscParser = new OscParser();
const pendingCommand = ref('');

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
let instance: TerminalInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let isMounted = true;
let contextMenuCleanup: (() => void) | null = null;
let focusCleanup: (() => void) | null = null;

// ── Session state ──
const sessionId = ref<string | null>(null);

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
    instance?.terminal.paste(text);
  }
  closeContextMenu();
}

function handleCut() {
  handleCopy(); // terminal cut = copy (no delete)
}

// ── Shell commands ──
const shellCommands: Record<ShellType, string> = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  wsl2: 'wsl.exe',
};
const tabCwd = computed(() => store.tabs.find((t) => t.id === props.tabId)?.cwd ?? null);

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
    const text = new TextDecoder().decode(bytes);
    const { cleanData, events } = oscParser.feed(text);

    // Write clean data (OSC stripped) to xterm
    if (cleanData) terminal.write(cleanData);

    // Process OSC events
    for (const event of events) {
      if (event.type === 'command_start') {
        pendingCommand.value = '';
      } else if (event.type === 'exec_start') {
        const command = event.command?.trim() || pendingCommand.value;
        blockStore.startBlock(props.paneId, command);
        pendingCommand.value = '';
      } else if (event.type === 'exec_end') {
        blockStore.endBlock(props.paneId, event.exitCode ?? 0);
      }
    }
  };

  // ── Spawn PTY ──
  let sid: string;
  try {
    sid = await invoke<string>('create_pty', {
      shell: shellCommands[props.shellType],
      cols: terminal.cols,
      rows: terminal.rows,
      cwd: tabCwd.value,
      channel,
    });
  } catch (e) {
    terminal.write(`\r\nFailed to start shell: ${e}\r\n`);
    return;
  }
  if (!isMounted) {
    invoke('close_pty_cmd', { sessionId: sid }).catch(() => {});
    return;
  }
  sessionId.value = sid;
  store.setPaneSessionId(props.tabId, props.paneId, sid);

  // ── Focus tracking ──
  const onFocus = () => store.setActivePane(props.tabId, props.paneId);
  terminal.element?.addEventListener('focus', onFocus);
  focusCleanup = () => terminal.element?.removeEventListener('focus', onFocus);

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
    // Block app-level shortcuts from reaching xterm/PTY
    if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false;
    if (e.ctrlKey && e.key === 'Tab') return false;
    if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'E' || e.key === 'W')) return false;
    if (e.key === 'F2') return false;
    return true;
  });

  // ── PTY write ──
  terminal.onData((data) => {
    if (!sessionId.value) return;
    invoke('write_pty_cmd', {
      sessionId: sessionId.value,
      data: Array.from(new TextEncoder().encode(data)),
    }).catch(() => {});
  });

  // ── Resize observer ──
  resizeObserver = new ResizeObserver(() => {
    if (!isMounted) return;
    fitAddon.fit();
    if (sessionId.value) {
      invoke('resize_pty_cmd', {
        sessionId: sessionId.value,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {});
    }
  });
  resizeObserver.observe(container);

  nextTick(() => terminal.focus());
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
        instance!.terminal.focus();
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
    instance.terminal.focus();
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
  blockStore.clearBlocks(props.paneId);
  window.removeEventListener('lumiterm:focus-pane', handleFocusPane);
  window.removeEventListener('lumiterm:copy', handleTerminalCopy);
  window.removeEventListener('lumiterm:paste', handleTerminalPaste);
  window.removeEventListener('lumiterm:cut', handleTerminalCut);
  document.removeEventListener('click', handleGlobalClick);
  contextMenuCleanup?.();
  focusCleanup?.();
  resizeObserver?.disconnect();
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

    <!-- Command status bar -->
    <CommandStatusBar :pane-id="paneId" />

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
  bottom: 28px;
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

.block-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 40%;
  overflow-y: auto;
  pointer-events: none;
  z-index: 10;
  padding: 4px;
}
</style>

<!-- Global styles for context menu (not scoped - teleported to body) -->
<style>
.terminal-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: color-mix(in srgb, var(--ui-menu-bg) 72%, #000 28%);
  border: 1px solid color-mix(in srgb, var(--ui-menu-border) 82%, #fff 18%);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 140px;
  backdrop-filter: blur(10px) saturate(120%);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255,255,255,0.14);
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
  background: var(--ui-menu-hover);
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
