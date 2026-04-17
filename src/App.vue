<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import TabBar from './components/TabBar.vue';
import TerminalTab from './components/TerminalTab.vue';
import { useTerminalStore } from './stores/terminalStore';

const store = useTerminalStore();

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

onMounted(() => {
  store.createTab('powershell');
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>

<template>
  <div class="app-container">
    <div class="titlebar" data-tauri-drag-region>
      <div class="titlebar-title">LumiTerm</div>
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
  display: flex; align-items: center;
  padding: 0 12px; user-select: none;
}
.titlebar-title { font-size: 13px; color: #cdd6f4; font-weight: 500; }
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
</style>
