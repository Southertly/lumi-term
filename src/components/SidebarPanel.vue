<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, nextTick, ref } from 'vue';
import { useTerminalStore, type ShellType, type Tab } from '../stores/terminalStore';

const store = useTerminalStore();

interface WorkspaceEntry {
  name: string;
  path: string;
  kind: 'drive' | 'folder';
}

const workspaceInput = ref('');
const workspaceMenuOpen = ref(false);
const workspaceError = ref('');
const workspaceEntries = ref<WorkspaceEntry[]>([]);
const browsedWorkspacePath = ref<string | null>(null);
const workspaceLoading = ref(false);
const workspaceFilterTouched = ref(false);
const selectedWorkspaceEntryIndex = ref<number | null>(null);
const workspaceBrowserRef = ref<HTMLElement | null>(null);

const shells: { type: ShellType; label: string; icon: string }[] = [
  { type: 'powershell', label: 'PowerShell', icon: '❯' },
  { type: 'cmd', label: 'CMD', icon: '⬛' },
  { type: 'wsl2', label: 'WSL2', icon: '🐧' },
];

const iconMap: Record<ShellType, string> = {
  powershell: '❯',
  cmd: '⬛',
  wsl2: '🐧',
};

const workspaceName = computed(() => {
  const path = store.currentWorkspacePath ?? 'Workspace';
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? normalized;
});

const activeWorkspacePath = computed<string | undefined>(() => store.currentWorkspacePath ?? undefined);
const workspacePathLabel = computed(() => activeWorkspacePath.value ?? '未选择工作目录');
const canGoToParentWorkspace = computed(() => {
  const path = browsedWorkspacePath.value;
  if (!path) return false;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '');
  return !/^[A-Za-z]:$/.test(normalized) && normalized !== '/';
});
const filteredWorkspaceEntries = computed(() => {
  if (!workspaceFilterTouched.value) return workspaceEntries.value;
  const query = workspaceInput.value.trim().toLowerCase();
  if (!query) return workspaceEntries.value;
  return workspaceEntries.value.filter((entry) => {
    return entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query);
  });
});
const selectedWorkspaceEntry = computed(() => (
  selectedWorkspaceEntryIndex.value === null
    ? null
    : filteredWorkspaceEntries.value[selectedWorkspaceEntryIndex.value] ?? null
));

const sessionTabs = computed(() => store.tabsForCurrentWorkspace);

const loadWorkspaceRoots = async () => {
  workspaceLoading.value = true;
  workspaceError.value = '';
  browsedWorkspacePath.value = null;
  try {
    workspaceEntries.value = await invoke<WorkspaceEntry[]>('list_workspace_roots');
    selectedWorkspaceEntryIndex.value = null;
  } catch (error) {
    workspaceEntries.value = [];
    workspaceError.value = String(error);
  } finally {
    workspaceLoading.value = false;
  }
};

const focusWorkspaceBrowser = () => {
  void nextTick(() => workspaceBrowserRef.value?.focus());
};

const scrollSelectedWorkspaceEntryIntoView = () => {
  void nextTick(() => {
    const browser = workspaceBrowserRef.value;
    const selected = browser?.querySelector<HTMLElement>('.workspace-browser-item.selected');
    selected?.scrollIntoView({ block: 'center' });
  });
};

const loadWorkspaceChildren = async (path: string, options?: { focusBrowser?: boolean }) => {
  workspaceLoading.value = true;
  workspaceError.value = '';
  try {
    workspaceEntries.value = await invoke<WorkspaceEntry[]>('list_workspace_children', { path });
    selectedWorkspaceEntryIndex.value = null;
    browsedWorkspacePath.value = path;
    workspaceInput.value = path;
    workspaceFilterTouched.value = false;
    if (options?.focusBrowser) focusWorkspaceBrowser();
  } catch (error) {
    workspaceEntries.value = [];
    workspaceError.value = String(error);
  } finally {
    workspaceLoading.value = false;
  }
};

const openWorkspaceMenu = () => {
  if (store.sidebarCollapsed) return;
  workspaceMenuOpen.value = !workspaceMenuOpen.value;
  workspaceError.value = '';
  if (workspaceMenuOpen.value) {
    workspaceInput.value = store.currentWorkspacePath ?? '';
    workspaceFilterTouched.value = false;
    void loadWorkspaceRoots();
  }
};

const toggleSidebar = () => {
  if (!store.sidebarCollapsed) {
    workspaceMenuOpen.value = false;
  }
  store.toggleSidebarCollapsed();
};

const setWorkspace = async (path: string) => {
  workspaceError.value = '';
  try {
    const canonicalPath = await invoke<string>('validate_workspace_path', { path });
    store.setCurrentWorkspace(canonicalPath);
    workspaceInput.value = '';
    workspaceMenuOpen.value = false;
  } catch (error) {
    workspaceError.value = String(error);
  }
};

const setWorkspaceFromInput = () => {
  const input = workspaceInput.value.trim();
  const path = input || selectedWorkspaceEntry.value?.path || browsedWorkspacePath.value;
  if (!path) return;
  void setWorkspace(path);
};

const confirmSelectedWorkspace = () => {
  const path = selectedWorkspaceEntry.value?.path ?? browsedWorkspacePath.value ?? workspaceInput.value.trim();
  if (!path) return;
  void setWorkspace(path);
};

const goToParentWorkspace = () => {
  const path = browsedWorkspacePath.value;
  if (!path) return;
  const normalized = path.replace(/\\/g, '/').replace(/\/+$/g, '');
  const parent = normalized.replace(/\/[^/]+$/g, '');
  if (!parent || parent === normalized || /^[A-Za-z]:$/.test(parent)) {
    void loadWorkspaceRoots();
    return;
  }
  void loadWorkspaceChildren(parent);
};

const browseWorkspaceEntry = (entry: WorkspaceEntry) => {
  void loadWorkspaceChildren(entry.path, { focusBrowser: true });
};

const selectWorkspaceEntry = (index: number) => {
  selectedWorkspaceEntryIndex.value = index;
};

const moveWorkspaceSelection = (direction: 1 | -1) => {
  const count = filteredWorkspaceEntries.value.length;
  if (count === 0) return;
  const currentIndex = selectedWorkspaceEntryIndex.value;
  selectedWorkspaceEntryIndex.value = currentIndex === null
    ? (direction === 1 ? 0 : count - 1)
    : (currentIndex + direction + count) % count;
  scrollSelectedWorkspaceEntryIntoView();
};

const handleWorkspaceBrowserKeydown = (event: KeyboardEvent) => {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    moveWorkspaceSelection(1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    moveWorkspaceSelection(-1);
    return;
  }
  if (event.key === 'Enter') {
    event.preventDefault();
    confirmSelectedWorkspace();
  }
};

const selectWorkspace = (path: string) => {
  void setWorkspace(path);
};

const createSession = (shellType: ShellType = 'powershell') => {
  store.createTab(shellType, undefined, activeWorkspacePath.value);
};

const closeSession = (event: MouseEvent | KeyboardEvent, tab: Tab) => {
  event.preventDefault();
  event.stopPropagation();
  if (!confirm(`关闭 ${tab.title}？`)) return;
  store.removeTab(tab.id);
};

const getSessionSubtitle = (tab: Tab) => {
  const shell = shells.find((item) => item.type === tab.shellType)?.label ?? tab.shellType;
  if (tab.panes.length > 1) return `${shell} · ${tab.splitDirection === 'vertical' ? '左右分屏' : '上下分屏'}`;
  return shell;
};
</script>

<template>
  <aside class="sidebar-panel" :class="{ collapsed: store.sidebarCollapsed }" data-tauri-no-drag>
    <div class="sidebar-topbar">
      <button
        type="button"
        class="panel-toggle-button"
        :title="store.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        :aria-label="store.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
        :aria-pressed="store.sidebarCollapsed"
        :aria-expanded="!store.sidebarCollapsed"
        @click="toggleSidebar"
      >
        <svg
          class="panel-toggle-icon"
          :class="{ 'is-collapsed': store.sidebarCollapsed }"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <rect x="4" y="5" width="16" height="14" rx="2" />
          <path d="M9 5v14" />
          <path d="M14 9l3 3-3 3" />
        </svg>
      </button>
      <span v-if="!store.sidebarCollapsed" class="sidebar-topbar-title">Sessions</span>
    </div>

    <div class="workspace-section">
      <button
        type="button"
        class="workspace-button"
        :title="workspacePathLabel"
        :aria-label="`切换工作目录：${workspacePathLabel}`"
        @click="openWorkspaceMenu"
      >
        <span class="workspace-icon">📁</span>
        <span v-if="!store.sidebarCollapsed" class="workspace-text">
          <span class="workspace-name">{{ workspaceName }}</span>
          <span class="workspace-path">{{ workspacePathLabel }}</span>
        </span>
        <span v-if="!store.sidebarCollapsed" class="workspace-caret">⌄</span>
      </button>

      <div v-if="workspaceMenuOpen && !store.sidebarCollapsed" class="workspace-menu">
        <form class="workspace-form" @submit.prevent="setWorkspaceFromInput">
          <input
            v-model="workspaceInput"
            class="workspace-input"
            placeholder="输入或选择工作目录"
            aria-label="工作目录路径，按回车切换到输入目录"
            @input="workspaceFilterTouched = true; selectedWorkspaceEntryIndex = null"
            @keydown.enter.prevent="setWorkspaceFromInput"
            @keydown.arrow-down.prevent="focusWorkspaceBrowser"
            @keydown.arrow-up.prevent="focusWorkspaceBrowser"
          />
          <button class="workspace-submit" type="submit">切换</button>
        </form>

        <div v-if="workspaceError" class="workspace-error">{{ workspaceError }}</div>

        <div class="workspace-browser-toolbar">
          <button
            type="button"
            class="workspace-parent-button"
            :disabled="!canGoToParentWorkspace"
            @click="goToParentWorkspace"
          >返回上级</button>
          <span class="workspace-enter-hint">点击目录进入浏览；焦点到列表后上下键选择，Enter 切换高亮目录</span>
        </div>

        <div v-if="workspaceLoading" class="workspace-empty">正在读取文件夹…</div>

        <div
          v-else
          ref="workspaceBrowserRef"
          class="workspace-browser"
          role="listbox"
          aria-label="工作目录候选，按上下键选择，按回车切换高亮目录"
          tabindex="0"
          @keydown="handleWorkspaceBrowserKeydown"
        >
          <button
            v-for="(entry, index) in filteredWorkspaceEntries"
            :key="entry.path"
            class="workspace-browser-item"
            :class="{ selected: index === selectedWorkspaceEntryIndex }"
            type="button"
            role="option"
            :aria-selected="index === selectedWorkspaceEntryIndex"
            :aria-label="`浏览 ${entry.name}，${entry.path}`"
            @focus="selectWorkspaceEntry(index)"
            @click="browseWorkspaceEntry(entry)"
          >
            <span class="workspace-entry-kind">{{ entry.kind === 'drive' ? 'Drive' : 'Folder' }}</span>
            <span class="workspace-entry-name">{{ entry.name }}</span>
            <span class="workspace-entry-path">{{ entry.path }}</span>
          </button>
          <div v-if="filteredWorkspaceEntries.length === 0" class="workspace-empty">
            没有可显示的文件夹
          </div>
        </div>

        <div v-if="store.recentWorkspacePaths.length > 0" class="workspace-recent">
          <div class="workspace-recent-label">最近使用</div>
          <button
            v-for="path in store.recentWorkspacePaths"
            :key="path"
            class="workspace-history-item"
            type="button"
            :aria-label="`切换到工作目录 ${path}`"
            @click="selectWorkspace(path)"
          >
            <span>{{ path }}</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="!store.sidebarCollapsed" class="section-title-row">
      <span class="section-title">Sessions</span>
      <button type="button" class="new-session-primary" aria-label="新建 PowerShell session" @click="createSession()">New</button>
    </div>

    <div class="session-list">
      <div v-if="!store.sidebarCollapsed && sessionTabs.length === 0" class="session-empty-state">
        <div class="session-empty-title">暂无 Session</div>
        <button
          type="button"
          class="session-empty-action"
          aria-label="新建 PowerShell session"
          @click="createSession('powershell')"
        >New PowerShell</button>
      </div>
      <template v-else>
        <div
          v-for="tab in sessionTabs"
          :key="tab.id"
          class="session-item"
          :class="{ active: tab.id === store.activeTabId }"
          :title="`${tab.title}\n${tab.cwd ?? workspacePathLabel}`"
        >
          <button
            type="button"
            class="session-select"
            :aria-label="`切换到 ${tab.title}`"
            @click="store.switchTab(tab.id)"
          >
            <span class="session-icon">{{ iconMap[tab.shellType] }}</span>
            <span v-if="!store.sidebarCollapsed" class="session-content">
              <span class="session-title">{{ tab.title }}</span>
              <span class="session-subtitle">{{ getSessionSubtitle(tab) }}</span>
            </span>
            <span v-if="!store.sidebarCollapsed && tab.panes.length > 1" class="split-badge">
              {{ tab.splitDirection === 'vertical' ? '▐' : '▀' }}
            </span>
            <span class="session-status" :class="{ active: tab.id === store.activeTabId }"></span>
          </button>
          <button
            v-if="!store.sidebarCollapsed"
            type="button"
            class="session-close"
            :aria-label="`关闭 ${tab.title}`"
            :title="`关闭 ${tab.title}`"
            @click="closeSession($event, tab)"
          >×</button>
        </div>
      </template>
    </div>

    <div class="sidebar-footer">
      <button
        v-if="store.sidebarCollapsed"
        type="button"
        class="icon-action"
        title="新建 PowerShell session"
        aria-label="新建 PowerShell session"
        @click="createSession()"
      >＋</button>
      <template v-else>
        <button
          v-for="shell in shells"
          :key="shell.type"
          type="button"
          class="shell-action"
          :aria-label="`新建 ${shell.label} session`"
          @click="createSession(shell.type)"
        >
          <span>{{ shell.icon }}</span>
          <span>{{ shell.label }}</span>
        </button>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.sidebar-panel {
  position: relative;
  width: 260px;
  min-width: 260px;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--ui-bg) 88%, #000 12%);
  border-right: 1px solid var(--ui-border);
  color: var(--ui-fg);
  transition: width 0.16s ease, min-width 0.16s ease;
}

.sidebar-panel.collapsed {
  width: 58px;
  min-width: 58px;
}

.sidebar-topbar {
  height: 56px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 7px;
  border-bottom: 1px solid var(--ui-border);
}

.collapsed .sidebar-topbar {
  justify-content: center;
}

.panel-toggle-button {
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--ui-fg);
  cursor: pointer;
  transition: background 0.14s ease, border-color 0.14s ease, color 0.14s ease, transform 0.14s ease;
}

.panel-toggle-button:hover {
  background: var(--ui-bg-light);
  border-color: var(--ui-hover);
  color: var(--ui-accent);
}

.panel-toggle-button:active {
  transform: scale(0.98);
}

.panel-toggle-button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-accent) 65%, #fff);
  outline-offset: -2px;
}

.panel-toggle-icon {
  transition: transform 0.16s ease;
}

.panel-toggle-icon.is-collapsed {
  transform: scaleX(-1);
}

.sidebar-topbar-title {
  min-width: 0;
  color: var(--ui-fg);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.workspace-section {
  position: relative;
  padding: 12px 10px;
  border-bottom: 1px solid var(--ui-border);
}

.workspace-button {
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, var(--ui-accent) 36%, var(--ui-border));
  border-radius: 10px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  cursor: pointer;
}

.collapsed .workspace-button {
  justify-content: center;
  padding: 8px 0;
}

.workspace-icon {
  flex-shrink: 0;
  font-size: 16px;
}

.workspace-text {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.workspace-name,
.session-title {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 650;
}

.workspace-path,
.session-subtitle {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--ui-fg-muted);
  font-size: 10px;
}

.workspace-caret {
  color: var(--ui-fg-muted);
}

.workspace-menu {
  position: absolute;
  left: 10px;
  right: 10px;
  top: calc(100% - 8px);
  z-index: 30;
  padding: 8px;
  border: 1px solid var(--ui-menu-border);
  border-radius: 10px;
  background: var(--ui-menu-bg);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.55);
}

.workspace-form {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
}

.workspace-input {
  min-width: 0;
  flex: 1;
  height: 28px;
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  padding: 0 8px;
  outline: none;
}

.workspace-submit,
.new-session-primary,
.session-empty-action {
  border: none;
  border-radius: 7px;
  background: var(--ui-accent);
  color: #11111b;
  font-weight: 700;
  cursor: pointer;
}

.workspace-submit {
  padding: 0 8px;
}

.workspace-error {
  margin: -2px 0 8px;
  color: #f38ba8;
  font-size: 11px;
  line-height: 1.35;
}

.workspace-browser-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin: 2px 0 6px;
}

.workspace-parent-button {
  min-height: 28px;
  border: 1px solid var(--ui-border);
  border-radius: 7px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  padding: 0 8px;
  cursor: pointer;
}

.workspace-parent-button:hover:not(:disabled),
.workspace-parent-button:focus-visible:not(:disabled) {
  border-color: var(--ui-accent);
  background: var(--ui-menu-hover);
  outline: none;
}

.workspace-parent-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.workspace-enter-hint {
  color: var(--ui-fg-muted);
  font-size: 11px;
}

.workspace-history-item {
  width: 100%;
  display: block;
  padding: 7px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-fg);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-history-item:hover,
.workspace-history-item:focus-visible {
  background: var(--ui-menu-hover);
  border-color: var(--ui-hover);
  outline: none;
}

.workspace-browser {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  margin-top: 8px;
}

.workspace-browser::-webkit-scrollbar {
  width: 6px;
}

.workspace-browser::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--ui-hover);
}

.workspace-browser-item {
  width: 100%;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 8px;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-fg);
  text-align: left;
  cursor: pointer;
}

.workspace-browser-item:hover,
.workspace-browser-item:focus-visible,
.workspace-browser-item.selected {
  border-color: var(--ui-accent);
  background: var(--ui-menu-hover);
  outline: none;
}

.workspace-entry-kind {
  grid-row: span 2;
  align-self: center;
  color: var(--ui-accent);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
}

.workspace-entry-name,
.workspace-entry-path {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-entry-name {
  font-size: 12px;
  font-weight: 700;
}

.workspace-entry-path,
.workspace-empty,
.workspace-recent-label {
  color: var(--ui-fg-muted);
  font-size: 11px;
}

.workspace-empty {
  padding: 8px;
  line-height: 1.35;
}

.workspace-recent {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border);
}

.workspace-recent-label {
  padding: 0 2px;
  font-weight: 700;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 10px 8px;
}

.section-title {
  color: var(--ui-fg-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.new-session-primary {
  height: 24px;
  padding: 0 9px;
  font-size: 12px;
}

.session-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 8px 8px;
}

.session-list::-webkit-scrollbar {
  width: 0;
}

.session-empty-state {
  min-height: 128px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 8px 2px;
  padding: 18px 12px;
  border: 1px dashed var(--ui-border);
  border-radius: 12px;
  background: var(--ui-bg-light);
  text-align: center;
}

.session-empty-title {
  color: var(--ui-fg-muted);
  font-size: 13px;
  font-weight: 650;
}

.session-empty-action {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.session-empty-action:hover,
.session-empty-action:focus-visible {
  filter: brightness(1.06);
}

.session-empty-action:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-accent) 65%, #fff);
  outline-offset: 2px;
}

.session-item {
  position: relative;
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: stretch;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  overflow: hidden;
}

.collapsed .session-item {
  min-height: 42px;
}

.session-item:hover,
.session-item:focus-within {
  background: var(--ui-bg-lighter);
  border-color: var(--ui-hover);
}

.session-item.active {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: #11111b;
}

.session-select {
  position: relative;
  min-width: 0;
  flex: 1;
  min-height: 40px;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.collapsed .session-select {
  justify-content: center;
  padding: 8px 0;
}

.session-select:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-accent) 65%, #fff);
  outline-offset: -2px;
}

.session-item.active .session-select:focus-visible {
  outline-color: rgba(17, 17, 27, 0.75);
}

.session-icon {
  flex-shrink: 0;
  width: 18px;
  text-align: center;
  font-size: 15px;
}

.session-content {
  min-width: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
}

.session-item.active .session-subtitle {
  color: rgba(17, 17, 27, 0.65);
}

.split-badge {
  color: var(--ui-fg-muted);
  font-size: 11px;
}

.session-item.active .split-badge {
  color: rgba(17, 17, 27, 0.55);
}

.session-status {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: #22c55e;
  opacity: 0.7;
}

.session-status.active {
  background: #11111b;
}

.session-close {
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 4px;
  background: transparent;
  padding: 0;
  opacity: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
}

.session-item:hover .session-close,
.session-item:focus-within .session-close,
.session-close:focus-visible {
  opacity: 0.7;
}

.session-close:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--ui-accent) 65%, #fff);
  outline-offset: 2px;
}

.session-item.active .session-close:focus-visible {
  outline-color: rgba(17, 17, 27, 0.75);
}

.session-close:hover {
  background: rgba(0, 0, 0, 0.18);
  opacity: 1;
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
  border-top: 1px solid var(--ui-border);
}

.shell-action,
.icon-action {
  min-height: 30px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  cursor: pointer;
}

.shell-action {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
}

.shell-action:hover,
.icon-action:hover {
  background: var(--ui-bg-lighter);
  border-color: var(--ui-hover);
}
</style>
