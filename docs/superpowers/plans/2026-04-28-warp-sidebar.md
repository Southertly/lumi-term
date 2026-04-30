# Warp Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Warp-style left sidebar that groups and switches terminal sessions by workspace while keeping the existing top tab bar in the first phase.

**Architecture:** Extend `terminalStore` with workspace/session metadata, add a focused `SidebarPanel.vue` navigation component, and change `App.vue` to a left-sidebar plus right-content layout. PTY lifecycle remains owned by `TerminalPane.vue`; backend PTY creation only gains an optional `cwd` argument so new sessions can start in the selected workspace.

**Tech Stack:** Vue 3, Pinia, TypeScript, Tauri 2, Rust, portable-pty, xterm.js.

---

## File Structure

| Action | File | Responsibility |
|---|---|---|
| Modify | `src/stores/terminalStore.ts` | Add `cwd`, workspace state, sidebar collapsed state, persistence, and workspace-filtered session helpers. |
| Create | `src/components/SidebarPanel.vue` | Render Warp-style workspace/session sidebar and call store methods for navigation. |
| Modify | `src/App.vue` | Import SidebarPanel and wrap existing TabBar/terminal area in a right content layout. |
| Modify | `src/components/TerminalPane.vue` | Read active tab cwd and pass optional cwd to `create_pty`. |
| Modify | `src-tauri/src/commands/pty.rs` | Accept optional cwd from frontend and pass it to `spawn_shell`. |
| Modify | `src-tauri/src/services/pty_service.rs` | Apply optional cwd to `CommandBuilder` after validating it is a directory. |

---

### Task 1: Add Workspace Metadata to terminalStore

**Files:**
- Modify: `src/stores/terminalStore.ts`

- [ ] **Step 1: Replace the store file with workspace-aware state**

Use this complete content for `src/stores/terminalStore.ts`:

```ts
import { defineStore } from 'pinia';
import { computed, ref, watch } from 'vue';

export type ShellType = 'powershell' | 'cmd' | 'wsl2';

export interface Pane {
  id: string;
  shellType: ShellType;
  sessionId: string | null;
  size: number;
}

export interface Tab {
  id: string;
  title: string;
  shellType: ShellType;
  sessionId: string | null;
  color?: string;
  cwd?: string;
  panes: Pane[];
  splitDirection: 'horizontal' | 'vertical' | null;
  activePaneId: string | null;
}

interface PersistedPane {
  shellType: ShellType;
  size: number;
}

interface PersistedTab {
  title: string;
  shellType: ShellType;
  color?: string;
  cwd?: string;
  panes?: PersistedPane[];
  splitDirection?: 'horizontal' | 'vertical' | null;
}

interface PersistedState {
  tabs: PersistedTab[];
  activeIndex: number;
  currentWorkspacePath?: string | null;
  recentWorkspacePaths?: string[];
  sidebarCollapsed?: boolean;
}

const STORAGE_KEY = 'lumiterm_tabs';

const shellTitles: Record<ShellType, string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  wsl2: 'WSL2',
};

const normalizePath = (path: string): string => path.trim();

const getFallbackWorkspace = (): string => {
  const path = window.location.pathname;
  return decodeURIComponent(path.slice(1)).replace(/\\/g, '/');
};

const persistState = (
  tabs: Tab[],
  activeTabId: string | null,
  currentWorkspacePath: string | null,
  recentWorkspacePaths: string[],
  sidebarCollapsed: boolean,
) => {
  const activeIndex = tabs.findIndex((t) => t.id === activeTabId);
  const data: PersistedState = {
    tabs: tabs.map(({ title, shellType, color, cwd, panes, splitDirection }) => ({
      title,
      shellType,
      color,
      cwd,
      panes: panes.map((p) => ({ shellType: p.shellType, size: p.size })),
      splitDirection,
    })),
    activeIndex: activeIndex >= 0 ? activeIndex : 0,
    currentWorkspacePath,
    recentWorkspacePaths,
    sidebarCollapsed,
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* storage full or unavailable */ }
};

const loadPersistedState = (): PersistedState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data.tabs) || data.tabs.length === 0) return null;
    return data;
  } catch {
    return null;
  }
};

export const useTerminalStore = defineStore('terminal', () => {
  const tabs = ref<Tab[]>([]);
  const activeTabId = ref<string | null>(null);
  const lastClosedTab = ref<PersistedTab | null>(null);
  const currentWorkspacePath = ref<string | null>(null);
  const recentWorkspacePaths = ref<string[]>([]);
  const sidebarCollapsed = ref(false);

  const activeTab = computed(() => tabs.value.find((t) => t.id === activeTabId.value) ?? null);

  const tabsForCurrentWorkspace = computed(() => {
    if (!currentWorkspacePath.value) return tabs.value;
    return tabs.value.filter((tab) => (tab.cwd ?? currentWorkspacePath.value) === currentWorkspacePath.value);
  });

  const addRecentWorkspace = (path: string) => {
    const normalized = normalizePath(path);
    if (!normalized) return;
    recentWorkspacePaths.value = [
      normalized,
      ...recentWorkspacePaths.value.filter((item) => item !== normalized),
    ].slice(0, 8);
  };

  const ensureWorkspace = (): string => {
    if (currentWorkspacePath.value) return currentWorkspacePath.value;
    const fallback = recentWorkspacePaths.value[0] ?? getFallbackWorkspace();
    currentWorkspacePath.value = fallback;
    addRecentWorkspace(fallback);
    return fallback;
  };

  function setCurrentWorkspace(path: string) {
    const normalized = normalizePath(path);
    if (!normalized) return;
    currentWorkspacePath.value = normalized;
    addRecentWorkspace(normalized);
  }

  function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed;
  }

  function toggleSidebarCollapsed() {
    sidebarCollapsed.value = !sidebarCollapsed.value;
  }

  function createTab(shellType: ShellType = 'powershell', title?: string, cwd?: string) {
    const id = crypto.randomUUID();
    const paneId = crypto.randomUUID();
    const tabWorkspace = cwd ? normalizePath(cwd) : ensureWorkspace();
    tabs.value.push({
      id,
      title: title ?? shellTitles[shellType],
      shellType,
      sessionId: null,
      cwd: tabWorkspace,
      panes: [{ id: paneId, shellType, sessionId: null, size: 100 }],
      splitDirection: null,
      activePaneId: paneId,
    });
    activeTabId.value = id;
    addRecentWorkspace(tabWorkspace);
    return id;
  }

  function setSessionId(tabId: string, sessionId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) {
      if (import.meta.env.DEV) console.warn(`[terminalStore] setSessionId: tab ${tabId} not found`);
      return;
    }
    tab.sessionId = sessionId;
    if (tab.panes.length > 0 && !tab.panes[0].sessionId) {
      tab.panes[0].sessionId = sessionId;
    }
  }

  function setPaneSessionId(tabId: string, paneId: string, sessionId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;
    const pane = tab.panes.find((p) => p.id === paneId);
    if (!pane) return;
    pane.sessionId = sessionId;
    if (tab.panes[0].id === paneId) {
      tab.sessionId = sessionId;
    }
  }

  function removeTab(id: string) {
    const index = tabs.value.findIndex((t) => t.id === id);
    if (index === -1) return;

    const tab = tabs.value[index];
    lastClosedTab.value = {
      title: tab.title,
      shellType: tab.shellType,
      color: tab.color,
      cwd: tab.cwd,
      panes: tab.panes.map((p) => ({ shellType: p.shellType, size: p.size })),
      splitDirection: tab.splitDirection,
    };

    tabs.value.splice(index, 1);

    if (activeTabId.value === id) {
      const next = tabs.value[index] ?? tabs.value[index - 1] ?? null;
      activeTabId.value = next?.id ?? null;
    }
  }

  function switchTab(id: string) {
    const tab = tabs.value.find((t) => t.id === id);
    if (!tab) return;
    activeTabId.value = id;
    if (tab.cwd) setCurrentWorkspace(tab.cwd);
  }

  function reorderTabs(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
    if (fromIndex >= tabs.value.length || toIndex >= tabs.value.length) return;

    const [movedTab] = tabs.value.splice(fromIndex, 1);
    tabs.value.splice(toIndex, 0, movedTab);
  }

  function renameTab(tabId: string, newTitle: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    const trimmed = newTitle.trim();
    if (trimmed.length === 0) return;

    tab.title = trimmed;
  }

  function closeOtherTabs(keepTabId: string) {
    const keepTab = tabs.value.find((t) => t.id === keepTabId);
    if (!keepTab) return;

    const tabsToRemove = tabs.value.filter((t) => t.id !== keepTabId);
    tabsToRemove.forEach((tab) => removeTab(tab.id));
  }

  function setTabColor(tabId: string, color: string | null) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    if (color === null) {
      tab.color = undefined;
    } else {
      tab.color = color;
    }
  }

  function splitTab(tabId: string, direction: 'horizontal' | 'vertical') {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab || tab.panes.length >= 2) return;

    const paneId = crypto.randomUUID();
    tab.panes[0].size = 50;
    tab.panes.push({ id: paneId, shellType: tab.shellType, sessionId: null, size: 50 });
    tab.splitDirection = direction;
    tab.activePaneId = paneId;
  }

  function closePane(tabId: string, paneId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    if (tab.panes.length <= 1) {
      removeTab(tabId);
      return;
    }

    tab.panes = tab.panes.filter((p) => p.id !== paneId);
    if (tab.panes.length === 1) {
      tab.panes[0].size = 100;
      tab.splitDirection = null;
    }
    tab.activePaneId = tab.panes[0].id;
  }

  function setActivePane(tabId: string, paneId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;
    if (tab.panes.some((p) => p.id === paneId)) {
      tab.activePaneId = paneId;
    }
  }

  function updatePaneSizes(tabId: string, sizes: [number, number]) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab || tab.panes.length < 2) return;
    tab.panes[0].size = sizes[0];
    tab.panes[1].size = sizes[1];
  }

  function getTabPaneCount(tabId: string): number {
    return tabs.value.find((t) => t.id === tabId)?.panes.length ?? 0;
  }

  function reopenTab() {
    if (!lastClosedTab.value) return null;
    const { title, shellType, color, cwd } = lastClosedTab.value;
    const id = createTab(shellType, title, cwd);
    const tab = tabs.value.find((t) => t.id === id);
    if (tab && color) tab.color = color;
    lastClosedTab.value = null;
    return id;
  }

  function moveTab(direction: -1 | 1) {
    const idx = tabs.value.findIndex((t) => t.id === activeTabId.value);
    if (idx === -1) return;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= tabs.value.length) return;
    reorderTabs(idx, newIdx);
  }

  function restoreTabs() {
    const persisted = loadPersistedState();
    if (!persisted) {
      ensureWorkspace();
      createTab('powershell');
      return;
    }

    recentWorkspacePaths.value = Array.isArray(persisted.recentWorkspacePaths)
      ? persisted.recentWorkspacePaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)
      : [];
    currentWorkspacePath.value = typeof persisted.currentWorkspacePath === 'string'
      ? persisted.currentWorkspacePath
      : recentWorkspacePaths.value[0] ?? null;
    sidebarCollapsed.value = persisted.sidebarCollapsed ?? false;
    const workspace = ensureWorkspace();

    for (const pt of persisted.tabs) {
      const panes = pt.panes ?? [{ shellType: pt.shellType, size: 100 }];
      createTab(pt.shellType, pt.title, pt.cwd ?? workspace);
      const tab = tabs.value[tabs.value.length - 1];
      if (pt.color) tab.color = pt.color;

      if (pt.panes && pt.panes.length > 0) {
        tab.panes = panes.map((p) => ({
          id: crypto.randomUUID(),
          shellType: p.shellType,
          sessionId: null,
          size: p.size,
        }));
        tab.splitDirection = pt.splitDirection ?? null;
        tab.activePaneId = tab.panes[0].id;
      }
    }
    const activeIndex = Math.min(persisted.activeIndex, tabs.value.length - 1);
    activeTabId.value = tabs.value[activeIndex]?.id ?? tabs.value[0]?.id ?? null;
    if (activeTab.value?.cwd) currentWorkspacePath.value = activeTab.value.cwd;
  }

  watch(
    [tabs, activeTabId, currentWorkspacePath, recentWorkspacePaths, sidebarCollapsed],
    () => persistState(
      tabs.value,
      activeTabId.value,
      currentWorkspacePath.value,
      recentWorkspacePaths.value,
      sidebarCollapsed.value,
    ),
    { deep: true },
  );

  return {
    tabs,
    activeTabId,
    activeTab,
    currentWorkspacePath,
    recentWorkspacePaths,
    sidebarCollapsed,
    tabsForCurrentWorkspace,
    createTab,
    setSessionId,
    setPaneSessionId,
    removeTab,
    switchTab,
    reorderTabs,
    renameTab,
    closeOtherTabs,
    setTabColor,
    splitTab,
    closePane,
    setActivePane,
    updatePaneSizes,
    getTabPaneCount,
    restoreTabs,
    reopenTab,
    moveTab,
    setCurrentWorkspace,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
  };
});
```

- [ ] **Step 2: Run frontend type/build check**

Run:

```bash
npx pnpm build
```

Expected: build succeeds. Existing Vite chunk-size warning is acceptable.

- [ ] **Step 3: Commit**

```bash
git add src/stores/terminalStore.ts
git commit -m "feat: add workspace metadata to terminal store"
```

---

### Task 2: Add SidebarPanel Component

**Files:**
- Create: `src/components/SidebarPanel.vue`

- [ ] **Step 1: Create `SidebarPanel.vue`**

Use this complete content:

```vue
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useTerminalStore, type ShellType, type Tab } from '../stores/terminalStore';

const store = useTerminalStore();
const workspaceInput = ref('');
const workspaceMenuOpen = ref(false);

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

const activeWorkspacePath = computed(() => store.currentWorkspacePath ?? '');

const sessionTabs = computed(() => store.tabsForCurrentWorkspace);

const setWorkspaceFromInput = () => {
  const path = workspaceInput.value.trim();
  if (!path) return;
  store.setCurrentWorkspace(path);
  workspaceInput.value = '';
  workspaceMenuOpen.value = false;
};

const selectWorkspace = (path: string) => {
  store.setCurrentWorkspace(path);
  workspaceMenuOpen.value = false;
};

const createSession = (shellType: ShellType = 'powershell') => {
  store.createTab(shellType, undefined, activeWorkspacePath.value);
};

const closeSession = (event: MouseEvent, tab: Tab) => {
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
    <button
      class="collapse-toggle"
      :title="store.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
      @click="store.toggleSidebarCollapsed()"
    >
      {{ store.sidebarCollapsed ? '›' : '‹' }}
    </button>

    <div class="workspace-section">
      <button class="workspace-button" :title="activeWorkspacePath" @click="workspaceMenuOpen = !workspaceMenuOpen">
        <span class="workspace-icon">📁</span>
        <span v-if="!store.sidebarCollapsed" class="workspace-text">
          <span class="workspace-name">{{ workspaceName }}</span>
          <span class="workspace-path">{{ activeWorkspacePath }}</span>
        </span>
        <span v-if="!store.sidebarCollapsed" class="workspace-caret">⌄</span>
      </button>

      <div v-if="workspaceMenuOpen && !store.sidebarCollapsed" class="workspace-menu">
        <form class="workspace-form" @submit.prevent="setWorkspaceFromInput">
          <input v-model="workspaceInput" class="workspace-input" placeholder="输入工作目录路径" />
          <button class="workspace-submit" type="submit">切换</button>
        </form>
        <button
          v-for="path in store.recentWorkspacePaths"
          :key="path"
          class="workspace-history-item"
          @click="selectWorkspace(path)"
        >
          <span>{{ path }}</span>
        </button>
      </div>
    </div>

    <div v-if="!store.sidebarCollapsed" class="section-title-row">
      <span class="section-title">Sessions</span>
      <button class="new-session-primary" @click="createSession()">New</button>
    </div>

    <div class="session-list">
      <button
        v-for="tab in sessionTabs"
        :key="tab.id"
        class="session-item"
        :class="{ active: tab.id === store.activeTabId }"
        :title="`${tab.title}\n${tab.cwd ?? activeWorkspacePath}`"
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
        <span v-if="!store.sidebarCollapsed" class="session-close" @click="closeSession($event, tab)">×</span>
      </button>
    </div>

    <div class="sidebar-footer">
      <button v-if="store.sidebarCollapsed" class="icon-action" title="新建 PowerShell session" @click="createSession()">＋</button>
      <template v-else>
        <button
          v-for="shell in shells"
          :key="shell.type"
          class="shell-action"
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

.collapse-toggle {
  position: absolute;
  top: 12px;
  right: -11px;
  z-index: 20;
  width: 22px;
  height: 42px;
  border: 1px solid var(--ui-border);
  border-left: none;
  border-radius: 0 8px 8px 0;
  background: var(--ui-bg-light);
  color: var(--ui-accent);
  cursor: pointer;
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
.new-session-primary {
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

.workspace-history-item {
  width: 100%;
  display: block;
  padding: 7px 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--ui-fg);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.workspace-history-item:hover {
  background: var(--ui-menu-hover);
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

.session-item {
  position: relative;
  width: 100%;
  min-height: 42px;
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 6px;
  padding: 8px 9px;
  border: 1px solid transparent;
  border-radius: 10px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  cursor: pointer;
  text-align: left;
}

.collapsed .session-item {
  justify-content: center;
  padding: 8px 0;
}

.session-item:hover {
  background: var(--ui-bg-lighter);
  border-color: var(--ui-hover);
}

.session-item.active {
  background: var(--ui-accent);
  border-color: var(--ui-accent);
  color: #11111b;
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
  border-radius: 4px;
  opacity: 0;
  color: inherit;
}

.session-item:hover .session-close {
  opacity: 0.7;
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
```

- [ ] **Step 2: Run frontend build**

Run:

```bash
npx pnpm build
```

Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/SidebarPanel.vue
git commit -m "feat: add workspace sidebar component"
```

---

### Task 3: Integrate SidebarPanel in App Layout

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Fix imports and add SidebarPanel import**

Replace the import block at the top of `src/App.vue` with:

```ts
<script setup lang="ts">
import { onMounted, onUnmounted, ref, computed, watchEffect } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import SidebarPanel from './components/SidebarPanel.vue';
import TabBar from './components/TabBar.vue';
import TerminalTab from './components/TerminalTab.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useTerminalStore } from './stores/terminalStore';
import { useThemeStore } from './stores/themeStore';
import { useShortcutsStore } from './stores/shortcutsStore';
```

Keep the existing script body after these imports unchanged.

- [ ] **Step 2: Replace the template layout**

Replace the `<template>` block in `src/App.vue` with:

```vue
<template>
  <div class="app-container" :style="uiVars" data-tauri-drag-region @mousedown="startDrag">
    <div class="titlebar">
      <div class="titlebar-title">LumiTerm</div>
      <div class="window-controls" data-tauri-no-drag>
        <button class="control-btn minimize-btn" @click="minimizeWindow">—</button>
        <button class="control-btn maximize-btn" @click="toggleMaximize">
          {{ isMaximized ? '❐' : '⬜' }}
        </button>
        <button class="control-btn close-btn" @click="closeApp">✕</button>
      </div>
    </div>
    <div class="main-layout" data-tauri-no-drag>
      <SidebarPanel />
      <div class="content-layout">
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
    </div>
  </div>
  <SettingsModal :visible="showSettings" @close="showSettings = false" />
</template>
```

- [ ] **Step 3: Replace the layout styles**

In the `<style>` block, replace:

```css
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
```

with:

```css
.main-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}
.content-layout {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npx pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/App.vue
git commit -m "feat: integrate sidebar layout"
```

---

### Task 4: Pass Workspace cwd to PTY Creation

**Files:**
- Modify: `src/components/TerminalPane.vue`
- Modify: `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/services/pty_service.rs`

- [ ] **Step 1: Update frontend PTY invocation**

In `src/components/TerminalPane.vue`, after `const shellCommands` add:

```ts
const tabCwd = computed(() => store.tabs.find((t) => t.id === props.tabId)?.cwd ?? null);
```

Then replace the `invoke<string>('create_pty', { ... })` object with:

```ts
{
  shell: shellCommands[props.shellType],
  cols: terminal.cols,
  rows: terminal.rows,
  cwd: tabCwd.value,
  channel,
}
```

- [ ] **Step 2: Update Tauri command signature**

In `src-tauri/src/commands/pty.rs`, change `create_pty` to:

```rust
#[tauri::command]
pub fn create_pty(
    store: State<PtyStore>,
    shell: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    channel: Channel<Vec<u8>>,
) -> Result<String, String> {
    let session_id = Uuid::new_v4().to_string();
    spawn_shell(store.inner().clone(), session_id.clone(), shell, cols, rows, cwd, channel)?;
    Ok(session_id)
}
```

- [ ] **Step 3: Update PTY service signature and cwd handling**

In `src-tauri/src/services/pty_service.rs`, change the `spawn_shell` signature to:

```rust
pub fn spawn_shell(
    store: PtyStore,
    session_id: String,
    shell: String,
    cols: u16,
    rows: u16,
    cwd: Option<String>,
    channel: Channel<Vec<u8>>,
) -> Result<(), String> {
```

After `let mut cmd = CommandBuilder::new(&resolved_shell);`, add:

```rust
    if let Some(cwd) = cwd.filter(|path| !path.trim().is_empty()) {
        let path = std::path::Path::new(&cwd);
        if !path.is_dir() {
            return Err(format!("working directory does not exist: {}", cwd));
        }
        cmd.cwd(path);
    }
```

- [ ] **Step 4: Run frontend build**

Run:

```bash
npx pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Run Rust check**

Run:

```bash
cd src-tauri && cargo check
```

Expected: check succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/TerminalPane.vue src-tauri/src/commands/pty.rs src-tauri/src/services/pty_service.rs
git commit -m "feat: launch sessions in workspace directory"
```

---

### Task 5: Verify Sidebar Behavior Manually

**Files:**
- No code changes expected unless verification finds bugs.

- [ ] **Step 1: Run full frontend build**

Run:

```bash
npx pnpm build
```

Expected: build succeeds.

- [ ] **Step 2: Run Rust check**

Run:

```bash
cd src-tauri && cargo check
```

Expected: check succeeds.

- [ ] **Step 3: Start the app**

Run:

```bash
npx pnpm tauri dev
```

Expected: LumiTerm launches with a left sidebar and the existing top tab bar.

- [ ] **Step 4: Manual UI checks**

Verify these behaviors:

```text
1. Top TabBar remains visible and usable.
2. Sidebar expands/collapses without clearing terminal output.
3. Sidebar New creates a new PowerShell session.
4. Footer shell buttons create PowerShell/CMD/WSL2 sessions.
5. Clicking a Sidebar session switches the right terminal and top TabBar highlight.
6. Clicking a top tab updates the active Sidebar session.
7. Entering a workspace path in the Sidebar changes the session list filter.
8. Creating a session after changing workspace starts the shell in that directory.
9. Closing a Sidebar session unmounts the terminal and does not leave a zombie shell process.
10. Restarting the app restores sidebar collapsed state, workspace, and tab cwd metadata.
```

- [ ] **Step 5: Fix any verification bugs**

If a verification item fails, make the smallest focused fix in the relevant file and rerun the failing check plus `npx pnpm build`.

- [ ] **Step 6: Commit verification fixes if needed**

If Step 5 changed code:

```bash
git add src src-tauri
git commit -m "fix: polish sidebar session workflow"
```

If Step 5 did not change code, do not create an empty commit.

---

## Self-Review

- Spec coverage: workspace/sidebar metadata is Task 1; visual sidebar is Task 2; App layout with top TabBar preserved is Task 3; cwd-backed session startup is Task 4; persistence and verification are covered by Tasks 1 and 5.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation steps remain.
- Type consistency: `cwd`, `currentWorkspacePath`, `recentWorkspacePaths`, `sidebarCollapsed`, `tabsForCurrentWorkspace`, and `toggleSidebarCollapsed` are consistently named across tasks.
