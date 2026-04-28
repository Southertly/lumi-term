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
