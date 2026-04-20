import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ShellType = 'powershell' | 'cmd' | 'wsl2';

export interface Tab {
  id: string;
  title: string;
  shellType: ShellType;
  sessionId: string | null;
  color?: string;
}

export const useTerminalStore = defineStore('terminal', () => {
  const tabs = ref<Tab[]>([]);
  const activeTabId = ref<string | null>(null);

  function createTab(shellType: ShellType = 'powershell') {
    const id = crypto.randomUUID();
    const titles: Record<ShellType, string> = {
      powershell: 'PowerShell',
      cmd: 'CMD',
      wsl2: 'WSL2',
    };
    tabs.value.push({ id, title: titles[shellType], shellType, sessionId: null });
    activeTabId.value = id;
    return id;
  }

  function setSessionId(tabId: string, sessionId: string) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) {
      if (import.meta.env.DEV) console.warn(`[terminalStore] setSessionId: tab ${tabId} not found`);
      return;
    }
    tab.sessionId = sessionId;
  }

  function removeTab(id: string) {
    const index = tabs.value.findIndex((t) => t.id === id);
    if (index === -1) return;

    tabs.value.splice(index, 1);

    if (activeTabId.value === id) {
      const next = tabs.value[index] ?? tabs.value[index - 1] ?? null;
      activeTabId.value = next?.id ?? null;
    }
  }

  function switchTab(id: string) {
    if (tabs.value.some((t) => t.id === id)) {
      activeTabId.value = id;
    }
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

    // Remove other tabs one by one to trigger proper cleanup
    const tabsToRemove = tabs.value.filter((t) => t.id !== keepTabId);
    tabsToRemove.forEach((tab) => removeTab(tab.id));
  }

  function setTabColor(tabId: string, color: string | null) {
    const tab = tabs.value.find((t) => t.id === tabId);
    if (!tab) return;

    if (color === null) {
      delete tab.color;
    } else {
      tab.color = color;
    }
  }

  return { tabs, activeTabId, createTab, setSessionId, removeTab, switchTab, reorderTabs, renameTab, closeOtherTabs, setTabColor };
});
