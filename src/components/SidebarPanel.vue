<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { computed, nextTick, ref, watch } from 'vue';
import { useEditorStore } from '../stores/editorStore';
import { useTerminalStore } from '../stores/terminalStore';
import FileTreeNode from './FileTreeNode.vue';

const store = useTerminalStore();
const editorStore = useEditorStore();

interface WorkspaceEntry {
  name: string;
  path: string;
  kind: 'drive' | 'folder';
}

interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  extension: string;
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

const rootEntries = ref<FileEntry[]>([]);
const fileTreeLoading = ref(false);

const treeRefreshKey = ref(0);
const refreshTree = () => { treeRefreshKey.value++; };

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

const loadRootEntries = async () => {
  const path = store.currentWorkspacePath;
  if (!path) { rootEntries.value = []; return; }
  fileTreeLoading.value = true;
  try {
    rootEntries.value = await invoke<FileEntry[]>('list_directory', { path });
  } catch {
    rootEntries.value = [];
  } finally {
    fileTreeLoading.value = false;
  }
};

watch(() => store.currentWorkspacePath, loadRootEntries, { immediate: true });

const loadWorkspaceRoots = async () => {
  workspaceLoading.value = true;
  workspaceError.value = '';
  const currentPath = store.currentWorkspacePath;
  browsedWorkspacePath.value = currentPath;
  try {
    workspaceEntries.value = currentPath
      ? await invoke<WorkspaceEntry[]>('list_workspace_children', { path: currentPath })
      : await invoke<WorkspaceEntry[]>('list_workspace_roots');
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
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      moveWorkspaceSelection(1);
      break;
    case 'ArrowUp':
      event.preventDefault();
      moveWorkspaceSelection(-1);
      break;
    case 'Enter':
      event.preventDefault();
      confirmSelectedWorkspace();
      break;
    case 'Escape':
      event.preventDefault();
      workspaceMenuOpen.value = false;
      break;
    case 'Tab':
      // Allow Tab to move focus naturally
      break;
    default:
      break;
  }
};

const openFile = (path: string) => {
  void editorStore.openFile(path);
};

const selectWorkspace = (path: string) => {
  void setWorkspace(path);
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
      <span v-if="!store.sidebarCollapsed" class="sidebar-topbar-title">Explorer</span>
    </div>

    <div v-if="!store.sidebarCollapsed" class="sidebar-tabs" role="tablist" aria-label="侧边栏标签">
      <button type="button" class="sidebar-tab active" role="tab" aria-selected="true">
        <span class="sidebar-tab-icon" aria-hidden="true">📄</span>
        <span class="sidebar-tab-label">文件</span>
      </button>
    </div>

    <div class="workspace-section">
      <div class="workspace-row">
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
      </div>

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

    <div class="file-tree">
      <div v-if="!store.currentWorkspacePath" class="file-tree-empty">
        选择工作目录以浏览文件
      </div>
      <div v-else-if="fileTreeLoading" class="file-tree-empty">
        正在加载…
      </div>
      <div v-else-if="rootEntries.length === 0" class="file-tree-empty">
        这个文件夹是空的
      </div>
      <template v-else>
        <FileTreeNode
          v-for="entry in rootEntries"
          :key="`${treeRefreshKey}-${entry.path}`"
          :entry="entry"
          :depth="0"
          @refresh="refreshTree"
          @open-file="openFile"
        />
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

.sidebar-tabs {
  display: flex;
  align-items: flex-end;
  min-height: 38px;
  padding: 6px 8px 0;
  gap: 4px;
  background: color-mix(in srgb, var(--ui-bg) 82%, #000 18%);
  border-bottom: 1px solid var(--ui-border);
}

.sidebar-tab {
  min-width: 76px;
  max-width: 140px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-bottom-color: transparent;
  border-radius: 8px 8px 0 0;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  font: inherit;
  font-size: 12px;
  cursor: default;
}

.sidebar-tab.active {
  background: color-mix(in srgb, var(--ui-bg-light) 82%, var(--ui-accent) 18%);
  color: var(--ui-accent);
}

.sidebar-tab-label {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-section {
  position: relative;
  padding: 12px 10px;
  border-bottom: 1px solid var(--ui-border);
}

.workspace-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.workspace-button {
  flex: 1;
  min-width: 0;
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

.workspace-name {
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 650;
}

.workspace-path {
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

.workspace-submit {
  border: none;
  border-radius: 7px;
  background: var(--ui-accent);
  color: #11111b;
  font-weight: 700;
  cursor: pointer;
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

.file-tree {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px 0;
}

.file-tree::-webkit-scrollbar {
  width: 6px;
}

.file-tree::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--ui-hover);
}

.file-tree-empty {
  padding: 16px 12px;
  color: var(--ui-fg-muted);
  font-size: 12px;
  text-align: center;
}
</style>
