<script setup lang="ts">
import { ref } from 'vue';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';

const store = useTerminalStore();
const dropdownOpen = ref(false);

const shells: { type: ShellType; label: string; icon: string; hint?: string }[] = [
  { type: 'powershell', label: 'PowerShell', icon: '❯', hint: 'Ctrl+T' },
  { type: 'cmd', label: 'CMD', icon: '⬛' },
  { type: 'wsl2', label: 'WSL2', icon: '🐧' },
];

const iconMap: Record<ShellType, string> = {
  powershell: '❯',
  cmd: '⬛',
  wsl2: '🐧',
};

function openTab(shellType: ShellType) {
  store.createTab(shellType);
  dropdownOpen.value = false;
}

function closeTab(e: MouseEvent, tabId: string) {
  e.stopPropagation();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (confirm(`关闭 ${tab.title}？`)) {
    store.removeTab(tabId);
    if (store.tabs.length === 0) {
      import('@tauri-apps/api/core')
        .then(({ invoke }) => invoke('close_app'))
        .catch((err) => console.error('[TabBar] close_app failed:', err));
    }
  }
}
</script>

<template>
  <div class="tab-bar" @click.self="dropdownOpen = false">
    <div
      v-for="tab in store.tabs"
      :key="tab.id"
      class="tab"
      :class="{ active: tab.id === store.activeTabId }"
      @click="store.switchTab(tab.id)"
    >
      <span class="tab-icon">{{ iconMap[tab.shellType] }}</span>
      <span class="tab-title">{{ tab.title }}</span>
      <span class="tab-close" @click="closeTab($event, tab.id)">×</span>
    </div>

    <div class="new-tab-wrapper">
      <div
        class="new-tab-btn"
        :class="{ open: dropdownOpen }"
        @click.stop="dropdownOpen = !dropdownOpen"
      >+</div>
      <div v-if="dropdownOpen" class="dropdown" @click.stop>
        <div
          v-for="shell in shells"
          :key="shell.type"
          class="dropdown-item"
          @click="openTab(shell.type)"
        >
          <span class="item-icon">{{ shell.icon }}</span>
          <span class="item-label">{{ shell.label }}</span>
          <span v-if="shell.hint" class="item-hint">{{ shell.hint }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  height: 40px;
  background: #181825;
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  border-bottom: 1px solid #11111b;
  overflow-x: auto;
  overflow-y: hidden;
}
.tab-bar::-webkit-scrollbar { height: 0; }

.tab {
  height: 32px;
  min-width: 140px;
  max-width: 200px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  gap: 8px;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  color: #cdd6f4;
}
.tab:hover { background: #262637; border-color: #45475a; }
.tab.active { background: #89b4fa; border-color: #89b4fa; color: #11111b; }
.tab.active .tab-icon { color: #11111b; }
.tab.active .tab-close { color: #11111b; opacity: 0.6; }

.tab-icon { font-size: 13px; color: #89b4fa; flex-shrink: 0; }
.tab.active .tab-icon { color: #11111b; }
.tab-title { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
.tab-close {
  width: 16px; height: 16px;
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; opacity: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(108,112,134,0.2); color: #cdd6f4; }

.new-tab-wrapper { position: relative; }
.new-tab-btn {
  width: 32px; height: 32px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  color: #89b4fa; font-size: 20px; line-height: 1;
  user-select: none;
}
.new-tab-btn:hover, .new-tab-btn.open { background: #262637; border-color: #45475a; }

.dropdown {
  position: absolute;
  top: 36px; left: 0;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 8px;
  overflow: hidden;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 100;
}
.dropdown-item {
  display: flex; align-items: center; gap: 10px;
  padding: 9px 14px;
  font-size: 13px; cursor: pointer;
  transition: background 0.1s ease;
  color: #cdd6f4;
}
.dropdown-item:hover { background: #313244; }
.item-icon { font-size: 14px; width: 18px; text-align: center; }
.item-label { flex: 1; }
.item-hint { font-size: 11px; color: #6c7086; }
</style>
