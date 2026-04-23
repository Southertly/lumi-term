<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue';
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

interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetTabId: string;
}

interface EditState {
  editingTabId: string;
  originalTitle: string;
}

interface ColorPickerState {
  visible: boolean;
  targetTabId: string;
  x: number;
  y: number;
}

const dragState = ref<DragState | null>(null);
const contextMenuState = ref<ContextMenuState | null>(null);
const editState = ref<EditState | null>(null);
const colorPickerState = ref<ColorPickerState | null>(null);
const TAB_WIDTH = 148; // min-width(140) + gap(4) + border(4)

const canSplitTab = computed(() => {
  if (!contextMenuState.value) return false;
  const tab = store.tabs.find((t) => t.id === contextMenuState.value!.targetTabId);
  return !!tab && tab.panes.length < 2;
});

const shells: { type: ShellType; label: string; icon: string; hint?: string }[] = [
  { type: 'powershell', label: 'PowerShell', icon: '❯', hint: 'Ctrl+T' },
  { type: 'cmd', label: 'CMD', icon: '⬛', hint: 'Ctrl+Shift+N' },
  { type: 'wsl2', label: 'WSL2', icon: '🐧', hint: 'Ctrl+Shift+L' },
];

const iconMap: Record<ShellType, string> = {
  powershell: '❯',
  cmd: '⬛',
  wsl2: '🐧',
};

const PRESET_COLORS = [
  { value: '#ef4444', label: '红色' },
  { value: '#f97316', label: '橙色' },
  { value: '#eab308', label: '黄色' },
  { value: '#22c55e', label: '绿色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#a855f7', label: '紫色' },
  { value: '#ec4899', label: '粉色' },
  { value: '#6b7280', label: '灰色' },
];

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
  // Right click is reserved for context menu
  if (e.button !== 0) return;

  // Cancel editing if in edit mode
  if (editState.value) {
    cancelEdit();
  }

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

function handleContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault();
  contextMenuState.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    targetTabId: tabId,
  };
}

onMounted(() => {
  function handleGlobalPointerDown(e: PointerEvent) {
    // 关闭右键菜单
    if (contextMenuState.value) {
      const menu = document.querySelector('.context-menu');
      if (menu && !menu.contains(e.target as Node)) {
        contextMenuState.value = null;
      }
    }

    // 关闭颜色选择器
    if (colorPickerState.value) {
      const picker = document.querySelector('.color-picker');
      if (picker && !picker.contains(e.target as Node)) {
        colorPickerState.value = null;
      }
    }

    // 关闭下拉菜单
    const dropdownEl = document.querySelector('.new-tab-wrapper');
    if (dropdownOpen.value && dropdownEl && !dropdownEl.contains(e.target as Node)) {
      dropdownOpen.value = false;
    }
  }

  function handleRenameShortcut(e: Event) {
    const tabId = (e as CustomEvent).detail;
    const tab = store.tabs.find((t) => t.id === tabId);
    if (!tab) return;
    editState.value = { editingTabId: tabId, originalTitle: tab.title };
    nextTick(() => {
      const input = document.querySelector<HTMLInputElement>('.tab-title-input');
      if (input) { input.focus(); input.select(); }
    });
  }

  document.addEventListener('pointerdown', handleGlobalPointerDown);
  window.addEventListener('lumiterm:rename-tab', handleRenameShortcut);

  onUnmounted(() => {
    document.removeEventListener('pointerdown', handleGlobalPointerDown);
    window.removeEventListener('lumiterm:rename-tab', handleRenameShortcut);
  });
});

function handleRename() {
  if (!contextMenuState.value) return;
  const tabId = contextMenuState.value.targetTabId;
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  contextMenuState.value = null;
  editState.value = { editingTabId: tabId, originalTitle: tab.title };

  nextTick(() => {
    const input = document.querySelector<HTMLInputElement>('.tab-title-input');
    if (input) { input.focus(); input.select(); }
  });
}

function handleCloseTab() {
  if (!contextMenuState.value) return;
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
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

function handleCloseOtherTabs() {
  if (!contextMenuState.value) return;
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
  store.closeOtherTabs(tabId);
}

function handleSplit(direction: 'horizontal' | 'vertical') {
  if (!contextMenuState.value) return;
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
  store.splitTab(tabId, direction);
}

function confirmEdit(e: Event) {
  if (!editState.value) return;
  const input = e.target as HTMLInputElement;
  const newTitle = input.value.trim();
  if (newTitle.length > 0) {
    store.renameTab(editState.value.editingTabId, newTitle);
  }
  editState.value = null;
}

function cancelEdit() {
  editState.value = null;
}

function openColorPicker(e: PointerEvent, tabId: string) {
  e.stopPropagation();
  e.preventDefault();
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  colorPickerState.value = {
    visible: true,
    targetTabId: tabId,
    x: rect.left,
    y: rect.bottom + 4,
  };
}

function selectColor(color: string) {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, color);
  colorPickerState.value = null;
}

function clearColor() {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, null);
  colorPickerState.value = null;
}

function openSettings() {
  window.dispatchEvent(new CustomEvent('lumiterm:open-settings'));
  dropdownOpen.value = false;
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
      @contextmenu="handleContextMenu($event, tab.id)"
    >
      <!-- 彩色竖条 -->
      <div v-if="tab.color" class="tab-color-bar" :style="{ backgroundColor: tab.color }"></div>

      <span class="tab-icon">{{ iconMap[tab.shellType] }}</span>
      <input
        v-if="editState?.editingTabId === tab.id"
        class="tab-title-input"
        :value="tab.title"
        @keydown.enter="confirmEdit"
        @keydown.escape="cancelEdit"
        @blur="confirmEdit"
        @click.stop
        @pointerdown.stop
      />
      <span v-else class="tab-title">{{ tab.title }}</span>
      <span v-if="tab.panes.length > 1" class="split-indicator"
            :title="tab.splitDirection === 'vertical' ? '左右分屏' : '上下分屏'">
        {{ tab.splitDirection === 'vertical' ? '▐' : '▀' }}
      </span>
      <!-- 颜色圆点 -->
      <div
        class="tab-color-dot"
        :class="{ 'has-color': tab.color }"
        :style="tab.color ? { backgroundColor: tab.color } : {}"
        @pointerdown="openColorPicker($event, tab.id)"
      ></div>
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

    <div class="settings-wrapper">
      <div class="settings-btn" @click.stop="openSettings()">⚙</div>
    </div>

    <Teleport to="body">
      <div
        v-if="contextMenuState?.visible"
        class="context-menu"
        :style="{ left: contextMenuState.x + 'px', top: contextMenuState.y + 'px' }"
        @click.stop
      >
        <div class="context-menu-item" @click="handleRename">
          重命名
        </div>
        <div class="context-menu-separator"></div>
        <div
          class="context-menu-item"
          :class="{ disabled: !canSplitTab }"
          @click="canSplitTab && handleSplit('vertical')"
        >
          ▐ 左右分屏
          <span class="menu-hint">Ctrl+Shift+D</span>
        </div>
        <div
          class="context-menu-item"
          :class="{ disabled: !canSplitTab }"
          @click="canSplitTab && handleSplit('horizontal')"
        >
          ▀ 上下分屏
          <span class="menu-hint">Ctrl+Shift+E</span>
        </div>
        <div class="context-menu-separator"></div>
        <div class="context-menu-item" @click="handleCloseTab">
          关闭标签
        </div>
        <div
          class="context-menu-item"
          :class="{ disabled: store.tabs.length <= 1 }"
          @click="store.tabs.length > 1 && handleCloseOtherTabs()"
        >
          关闭其他标签
        </div>
      </div>
    </Teleport>

    <!-- 颜色选择器 -->
    <div
      v-if="colorPickerState"
      class="color-picker"
      :style="{ left: colorPickerState.x + 'px', top: colorPickerState.y + 'px' }"
      @pointerdown.stop
      @click.stop
    >
      <div
        v-for="color in PRESET_COLORS"
        :key="color.value"
        class="color-option"
        :style="{ backgroundColor: color.value }"
        :title="color.label"
        @pointerdown.stop="selectColor(color.value)"
      ></div>
      <div class="color-option clear" title="清除颜色" @pointerdown.stop="clearColor">
        <span style="font-size: 14px; color: #6b7280;">×</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.tab-bar {
  height: 40px;
  background: var(--ui-bg);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 4px;
  border-bottom: 1px solid var(--ui-border);
  overflow-x: auto;
  overflow-y: visible;
}
.tab-bar::-webkit-scrollbar { height: 0; }

.tab {
  position: relative;
  height: 32px;
  min-width: 140px;
  max-width: 200px;
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 10px 0 14px;
  gap: 8px;
  cursor: grab;
  transition: all 0.15s ease;
  flex-shrink: 0;
  color: var(--ui-fg);
}
.tab:hover { background: var(--ui-bg-lighter); border-color: var(--ui-hover); }
.tab.active { background: var(--ui-accent); border-color: var(--ui-accent); color: #11111b; }
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

.tab-icon { font-size: 13px; color: var(--ui-accent); flex-shrink: 0; }
.tab.active .tab-icon { color: #11111b; }
.tab-title { flex: 1; font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }

.split-indicator {
  font-size: 11px;
  color: var(--ui-fg-muted);
  flex-shrink: 0;
  line-height: 1;
}
.tab.active .split-indicator { color: rgba(17,17,27,0.5); }
.tab-close {
  width: 16px; height: 16px;
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  font-size: 15px; opacity: 0;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tab:hover .tab-close { opacity: 1; }
.tab-close:hover { background: rgba(108,112,134,0.2); color: var(--ui-fg); }

.tab-color-bar {
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 80%;
  border-radius: 2px;
}

.tab-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  opacity: 0;
}
.tab:hover .tab-color-dot { opacity: 1; }
.tab-color-dot.has-color { opacity: 1; }
.tab-color-dot:hover { transform: scale(1.15); filter: brightness(1.1); }

.new-tab-wrapper { position: relative; }
.new-tab-btn {
  width: 32px; height: 32px;
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--ui-accent); font-size: 20px; line-height: 1;
  user-select: none;
}
.new-tab-btn:hover, .new-tab-btn.open { background: var(--ui-bg-lighter); border-color: var(--ui-hover); }

.settings-wrapper { position: relative; margin-left: auto; }
.settings-btn {
  width: 32px; height: 32px;
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  color: var(--ui-fg-muted); font-size: 16px; line-height: 1;
  user-select: none;
}
.settings-btn:hover, .settings-btn.open { background: var(--ui-bg-lighter); border-color: var(--ui-hover); color: var(--ui-fg); }


.dropdown {
  position: fixed;
  margin-top: 36px;
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
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
  color: var(--ui-fg);
}
.dropdown-item:hover { background: var(--ui-border); }
.item-icon { font-size: 14px; width: 18px; text-align: center; }
.item-label { flex: 1; }
.item-hint { font-size: 11px; color: var(--ui-fg-muted); }

.context-menu {
  position: fixed;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.4);
  min-width: 160px;
  z-index: 2000;
  padding: 4px 0;
}

.context-menu-item {
  padding: 9px 14px;
  font-size: 13px;
  color: var(--ui-fg);
  cursor: pointer;
  transition: background 0.1s ease;
  user-select: none;
  display: flex;
  align-items: center;
}

.context-menu-item:hover:not(.disabled) {
  background: var(--ui-hover);
}

.context-menu-item.disabled {
  color: var(--ui-fg-muted);
  cursor: not-allowed;
}

.context-menu-separator {
  height: 1px;
  background: var(--ui-border);
  margin: 4px 8px;
}

.menu-hint {
  margin-left: auto;
  font-size: 11px;
  color: var(--ui-fg-muted);
  padding-left: 20px;
}

.tab-title-input {
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-accent);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  color: var(--ui-fg);
  outline: none;
  width: 100%;
  font-family: inherit;
}

.color-picker {
  position: fixed;
  background: var(--ui-bg);
  backdrop-filter: blur(10px);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  z-index: 2000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.clear {
  background: rgba(107, 114, 128, 0.3);
  border: 1px dashed rgba(107, 114, 128, 0.6);
}

</style>
