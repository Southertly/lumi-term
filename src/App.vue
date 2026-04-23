<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import TabBar from './components/TabBar.vue';
import TerminalTab from './components/TerminalTab.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useTerminalStore } from './stores/terminalStore';
import { useThemeStore } from './stores/themeStore';
import { useHistoryStore } from './stores/historyStore';
import { useShortcutsStore } from './stores/shortcutsStore';

const store = useTerminalStore();
const themeStore = useThemeStore();
const historyStore = useHistoryStore();
const shortcutsStore = useShortcutsStore();
const showSettings = ref(false);
const onOpenSettings = () => { showSettings.value = true; };

const uiVars = computed(() => {
  const ui = themeStore.getCurrentTheme().ui;
  return {
    '--ui-bg': ui.bg,
    '--ui-bg-light': ui.bgLight,
    '--ui-bg-lighter': ui.bgLighter,
    '--ui-fg': ui.fg,
    '--ui-fg-muted': ui.fgMuted,
    '--ui-accent': ui.accent,
    '--ui-border': ui.border,
    '--ui-hover': ui.hover,
  };
});

let unlistenResize: (() => void) | null = null;

function closeApp() {
  invoke('close_app').catch((err) => console.error('[App] close_app failed:', err));
}

const isMaximized = ref(false);

async function minimizeWindow() {
  invoke('minimize_window').catch((err) => console.error('[App] minimize_window failed:', err));
}

async function toggleMaximize() {
  await invoke('toggle_maximize').catch((err) => console.error('[App] toggle_maximize failed:', err));
  await updateMaximizedState();
}

async function updateMaximizedState() {
  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  isMaximized.value = await getCurrentWindow().isMaximized();
}

function handleKeydown(e: KeyboardEvent) {
  // shortcutsStore-managed shortcuts
  if (shortcutsStore.matchesEvent('open-settings', e)) {
    e.preventDefault();
    showSettings.value = !showSettings.value;
    return;
  }
  if (shortcutsStore.matchesEvent('new-tab', e)) {
    e.preventDefault();
    store.createTab('powershell');
    return;
  }
  if (shortcutsStore.matchesEvent('close-tab', e)) {
    e.preventDefault();
    if (store.activeTabId) {
      const tab = store.tabs.find((t) => t.id === store.activeTabId);
      if (tab && confirm(`关闭 ${tab.title}？`)) {
        store.removeTab(store.activeTabId);
        if (store.tabs.length === 0) closeApp();
      }
    }
    return;
  }
  if (shortcutsStore.matchesEvent('next-tab', e)) {
    e.preventDefault();
    const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
    if (idx !== -1 && store.tabs.length > 1) {
      store.switchTab(store.tabs[(idx + 1) % store.tabs.length].id);
    }
    return;
  }
  if (shortcutsStore.matchesEvent('prev-tab', e)) {
    e.preventDefault();
    const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
    if (idx !== -1 && store.tabs.length > 1) {
      store.switchTab(store.tabs[(idx - 1 + store.tabs.length) % store.tabs.length].id);
    }
    return;
  }
  if (shortcutsStore.matchesEvent('copy', e)) {
    // Skip if xterm has focus — let Ctrl+C reach PTY as SIGINT in interactive mode
    if ((document.activeElement as HTMLElement)?.classList.contains('xterm-helper-textarea')) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:copy'));
    return;
  }
  if (shortcutsStore.matchesEvent('paste', e)) {
    if ((document.activeElement as HTMLElement)?.classList.contains('xterm-helper-textarea')) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:paste'));
    return;
  }
  if (shortcutsStore.matchesEvent('cut', e)) {
    if ((document.activeElement as HTMLElement)?.classList.contains('xterm-helper-textarea')) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:cut'));
    return;
  }
  if (shortcutsStore.matchesEvent('history-search', e)) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:history-search'));
    return;
  }

  // F2: rename active tab
  if (e.key === 'F2' && store.activeTabId) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:rename-tab', { detail: store.activeTabId }));
    return;
  }

  // Alt+Left/Right: move tab
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
    e.preventDefault();
    store.moveTab(e.key === 'ArrowLeft' ? -1 : 1);
    return;
  }

  if (!e.ctrlKey) return;

  // Ctrl+Shift+D: split right (vertical)
  if (e.shiftKey && e.key === 'D') {
    e.preventDefault();
    if (store.activeTabId) store.splitTab(store.activeTabId, 'vertical');
    return;
  }

  // Ctrl+Shift+E: split down (horizontal)
  if (e.shiftKey && e.key === 'E') {
    e.preventDefault();
    if (store.activeTabId) store.splitTab(store.activeTabId, 'horizontal');
    return;
  }

  // Ctrl+Shift+W: close active pane or tab
  if (e.shiftKey && e.key === 'W') {
    e.preventDefault();
    if (store.activeTabId) {
      const tab = store.tabs.find((t) => t.id === store.activeTabId);
      if (tab && tab.panes.length > 1 && tab.activePaneId) {
        store.closePane(store.activeTabId, tab.activePaneId);
      } else if (tab && confirm(`关闭 ${tab.title}？`)) {
        store.removeTab(store.activeTabId);
        if (store.tabs.length === 0) closeApp();
      }
    }
    return;
  }

  // Ctrl+Shift+Arrow: move focus between panes
  if (e.shiftKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    if (store.activeTabId) {
      const tab = store.tabs.find((t) => t.id === store.activeTabId);
      if (tab && tab.panes.length > 1) {
        const isVertical = tab.splitDirection === 'vertical';
        const isHorizontal = tab.splitDirection === 'horizontal';
        const shouldSwitch =
          (isVertical && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
          (isHorizontal && (e.key === 'ArrowUp' || e.key === 'ArrowDown'));

        if (shouldSwitch) {
          const currentIdx = tab.panes.findIndex((p) => p.id === tab.activePaneId);
          const nextIdx = currentIdx === 0 ? 1 : 0;
          store.setActivePane(tab.id, tab.panes[nextIdx].id);
          window.dispatchEvent(new CustomEvent('lumiterm:focus-pane', {
            detail: { tabId: tab.id, paneId: tab.panes[nextIdx].id },
          }));
        }
      }
    }
    return;
  }

  // Ctrl+Shift+T: reopen last closed tab
  if (e.shiftKey && e.key === 'T') {
    e.preventDefault();
    store.reopenTab();
    return;
  }

  // Ctrl+Shift+N: new CMD tab
  if (e.shiftKey && e.key === 'N') {
    e.preventDefault();
    store.createTab('cmd');
    return;
  }

  // Ctrl+Shift+L: new WSL2 tab
  if (e.shiftKey && e.key === 'L') {
    e.preventDefault();
    store.createTab('wsl2');
    return;
  }

  if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key) - 1;
    if (store.tabs[idx]) {
      e.preventDefault();
      store.switchTab(store.tabs[idx].id);
    }
  }
}

onMounted(async () => {
  store.restoreTabs();
  historyStore.cleanup();
  window.addEventListener('lumiterm:open-settings', onOpenSettings);
  window.addEventListener('keydown', handleKeydown);

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await updateMaximizedState();
  unlistenResize = await getCurrentWindow().listen('tauri://resize', updateMaximizedState);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('lumiterm:open-settings', onOpenSettings);
  if (unlistenResize) unlistenResize();
});
</script>

<template>
  <div class="app-container" :style="uiVars">
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-title">LumiTerm</div>
      <div class="window-controls">
        <button class="control-btn minimize-btn" @click="minimizeWindow">—</button>
        <button class="control-btn maximize-btn" @click="toggleMaximize">
          {{ isMaximized ? '❐' : '⬜' }}
        </button>
        <button class="control-btn close-btn" @click="closeApp">✕</button>
      </div>
    </div>
    <TabBar />
    <div class="terminal-wrapper">
      <TerminalTab
        v-for="tab in store.tabs"
        :key="tab.id"
        :tab-id="tab.id"
        :active="tab.id === store.activeTabId"
      />
    </div>
  </div>
  <SettingsModal :visible="showSettings" @close="showSettings = false" />
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
.app-container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: var(--ui-bg-light);
}
.titlebar {
  height: 32px; background: var(--ui-bg);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; user-select: none;
}
.titlebar-title { font-size: 13px; color: var(--ui-fg); font-weight: 500; }
.window-controls {
  display: flex;
  align-items: center;
  gap: 0;
}
.control-btn {
  width: 32px; height: 24px;
  background: transparent;
  border: none;
  color: var(--ui-fg);
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.control-btn:hover {
  background: var(--ui-border);
}
.close-btn:hover {
  background: #f38ba8;
  color: #11111b;
}
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
</style>
