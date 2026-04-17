<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import TabBar from './components/TabBar.vue';
import TerminalTab from './components/TerminalTab.vue';
import { useTerminalStore } from './stores/terminalStore';

const store = useTerminalStore();

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
  if (!e.ctrlKey) return;

  if (e.key === 't') {
    e.preventDefault();
    store.createTab('powershell');
  } else if (e.key === 'w') {
    e.preventDefault();
    if (store.activeTabId) {
      const tab = store.tabs.find((t) => t.id === store.activeTabId);
      if (tab && confirm(`关闭 ${tab.title}？`)) {
        store.removeTab(store.activeTabId);
        if (store.tabs.length === 0) {
          closeApp();
        }
      }
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
    if (idx === -1 || store.tabs.length < 2) return;
    const next = e.shiftKey
      ? (idx - 1 + store.tabs.length) % store.tabs.length
      : (idx + 1) % store.tabs.length;
    store.switchTab(store.tabs[next].id);
  } else if (e.key >= '1' && e.key <= '9') {
    const idx = parseInt(e.key) - 1;
    if (store.tabs[idx]) {
      e.preventDefault();
      store.switchTab(store.tabs[idx].id);
    }
  }
}

onMounted(async () => {
  store.createTab('powershell');
  window.addEventListener('keydown', handleKeydown);

  const { getCurrentWindow } = await import('@tauri-apps/api/window');
  await updateMaximizedState();
  unlistenResize = await getCurrentWindow().listen('tauri://resize', updateMaximizedState);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
  if (unlistenResize) unlistenResize();
});
</script>

<template>
  <div class="app-container">
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
        :shell-type="tab.shellType"
        :active="tab.id === store.activeTabId"
      />
    </div>
  </div>
</template>

<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body, #app { width: 100%; height: 100%; overflow: hidden; }
.app-container {
  width: 100%; height: 100%;
  display: flex; flex-direction: column;
  background: #1e1e2e;
}
.titlebar {
  height: 32px; background: #181825;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; user-select: none;
}
.titlebar-title { font-size: 13px; color: #cdd6f4; font-weight: 500; }
.window-controls {
  display: flex;
  align-items: center;
  gap: 0;
}
.control-btn {
  width: 32px; height: 24px;
  background: transparent;
  border: none;
  color: #cdd6f4;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.control-btn:hover {
  background: #313244;
}
.close-btn:hover {
  background: #f38ba8;
  color: #11111b;
}
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
</style>
