import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick } from 'vue';
import { useTerminalStore } from './terminalStore';

const STORAGE_KEY = 'lumiterm_tabs';

function stubDeterministicIds() {
  let nextId = 0;
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => `id-${++nextId}`),
  });
}

function createStore() {
  setActivePinia(createPinia());
  stubDeterministicIds();
  return useTerminalStore();
}

async function flushPersistWatcher() {
  await nextTick();
}

describe('terminalStore workspace behavior', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('normalizes and persists current workspace path with recent workspaces', async () => {
    const store = createStore();

    store.setCurrentWorkspace(' c:\\Users\\liu\\Project\\ ');
    await flushPersistWatcher();

    expect(store.currentWorkspacePath).toBe('C:/Users/liu/Project');
    expect(store.recentWorkspacePaths).toEqual(['C:/Users/liu/Project']);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      currentWorkspacePath: 'C:/Users/liu/Project',
      recentWorkspacePaths: ['C:/Users/liu/Project'],
      sidebarCollapsed: false,
    });
  });

  it('creates tabs in the current workspace and persists cwd', async () => {
    const store = createStore();

    store.setCurrentWorkspace('d:\\Workspace');
    const tabId = store.createTab('cmd', 'Workspace Shell');
    await flushPersistWatcher();

    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0]).toMatchObject({
      id: tabId,
      title: 'Workspace Shell',
      shellType: 'cmd',
      cwd: 'D:/Workspace',
    });
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}').tabs[0]).toMatchObject({
      title: 'Workspace Shell',
      shellType: 'cmd',
      cwd: 'D:/Workspace',
    });
  });

  it('toggles and persists sidebar collapsed state', async () => {
    const store = createStore();

    expect(store.sidebarCollapsed).toBe(false);

    store.toggleSidebarCollapsed();
    await flushPersistWatcher();

    expect(store.sidebarCollapsed).toBe(true);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')).toMatchObject({
      sidebarCollapsed: true,
    });
  });

  it('filters tabs for the current workspace while keeping uncategorized tabs visible', () => {
    const store = createStore();

    store.setCurrentWorkspace('C:/WorkspaceA');
    const firstWorkspaceTab = store.createTab('powershell', 'Workspace A');
    const globalTab = store.createTab('powershell', 'Global', undefined, { addToRecent: false });
    const global = store.tabs.find((tab) => tab.id === globalTab);
    if (!global) throw new Error('Expected global tab to exist');
    global.cwd = undefined;
    store.createTab('cmd', 'Workspace B', 'C:/WorkspaceB');

    expect(store.tabsForCurrentWorkspace.map((tab) => tab.id)).toEqual([
      firstWorkspaceTab,
      globalTab,
    ]);
  });

  it('restores workspace metadata but only creates one default tab', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      tabs: [
        { title: 'Old1', shellType: 'powershell', cwd: 'c:\\Workspace', panes: [{ shellType: 'powershell', size: 100 }] },
        { title: 'Old2', shellType: 'powershell', cwd: 'c:\\Workspace', panes: [{ shellType: 'powershell', size: 100 }] },
      ],
      activeIndex: 1,
      currentWorkspacePath: 'c:\\Workspace',
      recentWorkspacePaths: ['c:\\Workspace', 'd:\\Other'],
      sidebarCollapsed: true,
    }));
    const store = createStore();

    store.restoreTabs();

    expect(store.currentWorkspacePath).toBe('C:/Workspace');
    expect(store.recentWorkspacePaths).toEqual(['C:/Workspace', 'D:/Other']);
    expect(store.sidebarCollapsed).toBe(true);
    expect(store.tabs).toHaveLength(1);
    expect(store.tabs[0]).toMatchObject({
      title: 'PowerShell',
      shellType: 'powershell',
      cwd: 'C:/Workspace',
    });
  });
});
