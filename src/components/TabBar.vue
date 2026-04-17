<script setup lang="ts">
import { ref } from 'vue';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';

const store = useTerminalStore();
const dropdownOpen = ref(false);

interface DragState {
  draggedTabId: string;
  draggedIndex: number;
  currentIndex: number;
  startX: number;
  currentX: number;
}

const dragState = ref<DragState | null>(null);
const TAB_WIDTH = 148; // min-width(140) + gap(4) + border(4)

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
      setTimeout(() => {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('close_app'))
          .catch((err) => console.error('[TabBar] close_app failed:', err));
      }, 100);
    }
  }
}

function handlePointerDown(e: PointerEvent, tabId: string, index: number) {
  // Ignore if clicking close button
  if ((e.target as HTMLElement).closest('.tab-close')) return;

  // Ignore if only one tab
  if (store.tabs.length < 2) return;

  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);

  dragState.value = {
    draggedTabId: tabId,
    draggedIndex: index,
    currentIndex: index,
    startX: e.clientX,
    currentX: e.clientX,
  };
}

function handlePointerMove(e: PointerEvent) {
  if (!dragState.value) return;

  dragState.value.currentX = e.clientX;

  const deltaX = dragState.value.currentX - dragState.value.startX;

  const newIndex = Math.max(
    0,
    Math.min(
      store.tabs.length - 1,
      dragState.value.draggedIndex + Math.round(deltaX / TAB_WIDTH)
    )
  );

  if (newIndex === dragState.value.currentIndex) return;

  dragState.value.currentIndex = newIndex;
  // TODO: Visual feedback applied in Task 6 via getTabStyle computed helper
}

function handlePointerUp(e: PointerEvent) {
  if (!dragState.value) return;

  const target = e.currentTarget as HTMLElement;
  target.releasePointerCapture(e.pointerId);

  const deltaX = Math.abs(dragState.value.currentX - dragState.value.startX);

  // Only reorder if dragged more than 5px
  if (deltaX > 5) {
    store.reorderTabs(dragState.value.draggedIndex, dragState.value.currentIndex);
  }

  dragState.value = null;
}

function handlePointerCancel(e: PointerEvent) {
  if (!dragState.value) return;

  const target = e.currentTarget as HTMLElement;
  target.releasePointerCapture(e.pointerId);

  dragState.value = null;
}

function getTabStyle(tabId: string, index: number): Record<string, string> {
  if (!dragState.value) return {};

  // Dragged tab follows mouse
  if (tabId === dragState.value.draggedTabId) {
    const deltaX = dragState.value.currentX - dragState.value.startX;
    return { transform: `translateX(${deltaX}px)` };
  }

  // Other tabs shift to make space
  const draggedIdx = dragState.value.draggedIndex;
  const currentIdx = dragState.value.currentIndex;

  if (draggedIdx < currentIdx && index > draggedIdx && index <= currentIdx) {
    return { transform: `translateX(-${TAB_WIDTH}px)` };
  }

  if (draggedIdx > currentIdx && index < draggedIdx && index >= currentIdx) {
    return { transform: `translateX(${TAB_WIDTH}px)` };
  }

  return {};
}
</script>

<template>
  <div class="tab-bar" @click.self="dropdownOpen = false">
    <div
      v-for="(tab, index) in store.tabs"
      :key="tab.id"
      class="tab"
      :class="{
        active: tab.id === store.activeTabId,
        dragging: dragState?.draggedTabId === tab.id
      }"
      :style="getTabStyle(tab.id, index)"
      @click="store.switchTab(tab.id)"
      @pointerdown="handlePointerDown($event, tab.id, index)"
      @pointermove="handlePointerMove($event)"
      @pointerup="handlePointerUp($event)"
      @pointercancel="handlePointerCancel($event)"
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
  overflow-y: visible;
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
  cursor: grab;
  transition: all 0.15s ease;
  flex-shrink: 0;
  color: #cdd6f4;
}
.tab:hover { background: #262637; border-color: #45475a; }
.tab.active { background: #89b4fa; border-color: #89b4fa; color: #11111b; }
.tab.active .tab-icon { color: #11111b; }
.tab.active .tab-close { color: #11111b; opacity: 0.6; }

.tab.dragging {
  cursor: grabbing;
  opacity: 0.85;
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: none;
}

.tab:not(.dragging) {
  transition: transform 0.15s ease;
}

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
  position: fixed;
  margin-top: 36px;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 8px;
  overflow: hidden;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  z-index: 1000;
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
