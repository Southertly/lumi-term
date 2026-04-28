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

const activeWorkspacePath = computed<string | undefined>(() => store.currentWorkspacePath ?? undefined);
const workspacePathLabel = computed(() => activeWorkspacePath.value ?? '未选择工作目录');

const sessionTabs = computed(() => store.tabsForCurrentWorkspace);

const toggleWorkspaceMenu = () => {
  if (store.sidebarCollapsed) return;
  workspaceMenuOpen.value = !workspaceMenuOpen.value;
};

const toggleSidebar = () => {
  if (!store.sidebarCollapsed) {
    workspaceMenuOpen.value = false;
  }
  store.toggleSidebarCollapsed();
};

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

const closeSession = (event: MouseEvent | KeyboardEvent, tab: Tab) => {
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
      @click="toggleSidebar"
    >
      {{ store.sidebarCollapsed ? '›' : '‹' }}
    </button>

    <div class="workspace-section">
      <button class="workspace-button" :title="workspacePathLabel" @click="toggleWorkspaceMenu">
        <span class="workspace-icon">📁</span>
        <span v-if="!store.sidebarCollapsed" class="workspace-text">
          <span class="workspace-name">{{ workspaceName }}</span>
          <span class="workspace-path">{{ workspacePathLabel }}</span>
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
      <div
        v-for="tab in sessionTabs"
        :key="tab.id"
        class="session-item"
        :class="{ active: tab.id === store.activeTabId }"
        :title="`${tab.title}\n${tab.cwd ?? workspacePathLabel}`"
        role="button"
        tabindex="0"
        @click="store.switchTab(tab.id)"
        @keydown.enter="store.switchTab(tab.id)"
        @keydown.space.prevent="store.switchTab(tab.id)"
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
        <button
          v-if="!store.sidebarCollapsed"
          type="button"
          class="session-close"
          :aria-label="`关闭 ${tab.title}`"
          @click="closeSession($event, tab)"
        >×</button>
      </div>
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
  border: none;
  border-radius: 4px;
  background: transparent;
  padding: 0;
  opacity: 0;
  color: inherit;
  cursor: pointer;
  font: inherit;
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
