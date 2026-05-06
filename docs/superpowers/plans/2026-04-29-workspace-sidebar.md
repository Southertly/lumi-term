# Workspace Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add LumiTerm's first workspace sidebar with Explorer, Terminals, and Claude Tasks panels while preserving the existing terminal core.

**Architecture:** Keep `TerminalPane.vue`, PTY commands, xterm setup, and existing terminal store behavior stable. Add a workspace shell around the current tab bar and terminal area, plus a focused sidebar store and sidebar components that talk to existing terminal store actions.

**Tech Stack:** Vue 3, TypeScript, Pinia, Tauri v2, xterm.js, Vitest + Vue Test Utils for new frontend tests.

---

## File Structure

### Create

- `src/stores/sidebarStore.ts` — owns sidebar expanded/collapsed state, active panel, width, and localStorage persistence.
- `src/components/workspace/WorkspaceShell.vue` — app layout wrapper for sidebar + current tab bar + terminal workspace.
- `src/components/workspace/WorkspaceSidebar.vue` — sidebar rail, panel switcher, collapse control, resize handle.
- `src/components/workspace/ExplorerPanel.vue` — first-pass project/workspace panel.
- `src/components/workspace/TerminalsPanel.vue` — reads `terminalStore` and exposes tab/pane switching and creation.
- `src/components/workspace/ClaudeTasksPanel.vue` — stable first-pass AI task entry panel.
- `src/test/setup.ts` — Vitest setup file for Vue component tests.
- `src/stores/sidebarStore.test.ts` — store persistence and boundary tests.
- `src/components/workspace/WorkspaceSidebar.test.ts` — sidebar render and interaction tests.
- `src/components/workspace/TerminalsPanel.test.ts` — terminal list/action tests.

### Modify

- `package.json` — add `test`, `test:run`, and Vitest dependencies.
- `vite.config.ts` — add Vitest jsdom test config.
- `src/App.vue` — fix import formatting and wrap existing `TabBar` + `TerminalTab` area in `WorkspaceShell`.
- `src/stores/terminalStore.ts` — add one derived helper for panel display if implementation needs it; do not change existing tab/pane lifecycle semantics.
- `.gitignore` — ensure `.superpowers/` stays out of source control.

### Do not modify in this feature

- `src/components/TerminalPane.vue` — no xterm/PTY lifecycle changes in this sidebar MVP.
- `src-tauri/src/services/pty_service.rs` — PTY cleanup hardening is a later stabilization task.
- `src-tauri/src/commands/pty.rs` — no new backend command is needed for the first sidebar MVP.

---

## Existing Flow to Reuse

```
App.vue
  ├── titlebar + window controls
  ├── TabBar.vue
  │     └── terminalStore.createTab/removeTab/switchTab/splitTab
  └── TerminalTab.vue
        └── TerminalPane.vue
              └── Tauri PTY commands + xterm
```

New workspace flow:

```
App.vue
  ├── titlebar + window controls
  └── WorkspaceShell.vue
        ├── WorkspaceSidebar.vue
        │     ├── ExplorerPanel.vue
        │     ├── TerminalsPanel.vue ── reuses terminalStore actions
        │     └── ClaudeTasksPanel.vue
        └── main workspace
              ├── TabBar.vue
              └── TerminalTab.vue
```

---

## Task 1: Add Vitest test infrastructure

**Files:**
- Modify: `package.json`
- Modify: `vite.config.ts`
- Create: `src/test/setup.ts`

- [ ] **Step 1: Install test dependencies**

Run:

```bash
rtk npx pnpm add -D vitest @vue/test-utils jsdom
```

Expected: dependencies added to `devDependencies` and lockfile updated.

- [ ] **Step 2: Add test scripts**

In `package.json`, make the scripts block exactly:

```json
"scripts": {
  "dev": "vite",
  "build": "vue-tsc --noEmit && vite build",
  "preview": "vite preview",
  "tauri": "tauri",
  "test": "vitest",
  "test:run": "vitest run"
}
```

- [ ] **Step 3: Configure Vitest in Vite**

Update `vite.config.ts` to include test config:

```ts
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
});
```

- [ ] **Step 4: Add test setup file**

Create `src/test/setup.ts`:

```ts
import { beforeEach, vi } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
```

- [ ] **Step 5: Verify test command runs**

Run:

```bash
rtk npx pnpm test:run -- --passWithNoTests
```

Expected: PASS or no-test success. If Vitest rejects `--passWithNoTests`, run `rtk npx pnpm test:run` after Task 2 creates tests.

---

## Task 2: Add sidebar store with persistence

**Files:**
- Create: `src/stores/sidebarStore.ts`
- Create: `src/stores/sidebarStore.test.ts`

- [ ] **Step 1: Write store tests first**

Create `src/stores/sidebarStore.test.ts`:

```ts
import { setActivePinia, createPinia } from 'pinia';
import { describe, beforeEach, expect, it } from 'vitest';
import { useSidebarStore } from './sidebarStore';

describe('sidebarStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('starts expanded on the Explorer panel with a safe default width', () => {
    const store = useSidebarStore();

    expect(store.expanded).toBe(true);
    expect(store.activePanel).toBe('explorer');
    expect(store.width).toBe(260);
  });

  it('switches panels and persists the active panel', () => {
    const store = useSidebarStore();

    store.setActivePanel('terminals');

    expect(store.activePanel).toBe('terminals');
    expect(JSON.parse(localStorage.getItem('lumiterm_sidebar')!)).toMatchObject({
      activePanel: 'terminals',
    });
  });

  it('clamps sidebar width to usable terminal bounds', () => {
    const store = useSidebarStore();

    store.setWidth(80);
    expect(store.width).toBe(180);

    store.setWidth(700);
    expect(store.width).toBe(420);
  });

  it('restores persisted state when the store is created', () => {
    localStorage.setItem('lumiterm_sidebar', JSON.stringify({
      expanded: false,
      activePanel: 'claude-tasks',
      width: 320,
    }));

    const store = useSidebarStore();

    expect(store.expanded).toBe(false);
    expect(store.activePanel).toBe('claude-tasks');
    expect(store.width).toBe(320);
  });

  it('ignores invalid persisted state', () => {
    localStorage.setItem('lumiterm_sidebar', JSON.stringify({
      expanded: 'yes',
      activePanel: 'unknown',
      width: 9999,
    }));

    const store = useSidebarStore();

    expect(store.expanded).toBe(true);
    expect(store.activePanel).toBe('explorer');
    expect(store.width).toBe(260);
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk npx pnpm test:run src/stores/sidebarStore.test.ts
```

Expected: FAIL because `sidebarStore.ts` does not exist.

- [ ] **Step 3: Implement the sidebar store**

Create `src/stores/sidebarStore.ts`:

```ts
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export type SidebarPanel = 'explorer' | 'terminals' | 'claude-tasks';

const STORAGE_KEY = 'lumiterm_sidebar';
const DEFAULT_WIDTH = 260;
const MIN_WIDTH = 180;
const MAX_WIDTH = 420;

interface PersistedSidebarState {
  expanded: boolean;
  activePanel: SidebarPanel;
  width: number;
}

const panels: SidebarPanel[] = ['explorer', 'terminals', 'claude-tasks'];

function clampWidth(width: number) {
  return Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, Math.round(width)));
}

function isSidebarPanel(value: unknown): value is SidebarPanel {
  return typeof value === 'string' && panels.includes(value as SidebarPanel);
}

function loadPersistedState(): PersistedSidebarState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<PersistedSidebarState>;
    if (typeof data.expanded !== 'boolean') return null;
    if (!isSidebarPanel(data.activePanel)) return null;
    if (typeof data.width !== 'number') return null;
    if (data.width < MIN_WIDTH || data.width > MAX_WIDTH) return null;
    return {
      expanded: data.expanded,
      activePanel: data.activePanel,
      width: clampWidth(data.width),
    };
  } catch {
    return null;
  }
}

export const useSidebarStore = defineStore('sidebar', () => {
  const persisted = loadPersistedState();
  const expanded = ref(persisted?.expanded ?? true);
  const activePanel = ref<SidebarPanel>(persisted?.activePanel ?? 'explorer');
  const width = ref(persisted?.width ?? DEFAULT_WIDTH);

  function setExpanded(value: boolean) {
    expanded.value = value;
  }

  function toggleExpanded() {
    expanded.value = !expanded.value;
  }

  function setActivePanel(panel: SidebarPanel) {
    activePanel.value = panel;
    expanded.value = true;
  }

  function setWidth(value: number) {
    width.value = clampWidth(value);
  }

  watch([expanded, activePanel, width], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        expanded: expanded.value,
        activePanel: activePanel.value,
        width: width.value,
      }));
    } catch {
      // localStorage may be unavailable in restricted webviews.
    }
  }, { immediate: true });

  return {
    expanded,
    activePanel,
    width,
    setExpanded,
    toggleExpanded,
    setActivePanel,
    setWidth,
  };
});
```

- [ ] **Step 4: Run the store tests**

Run:

```bash
rtk npx pnpm test:run src/stores/sidebarStore.test.ts
```

Expected: PASS.

---

## Task 3: Add workspace shell and sidebar UI skeleton

**Files:**
- Create: `src/components/workspace/WorkspaceShell.vue`
- Create: `src/components/workspace/WorkspaceSidebar.vue`
- Create: `src/components/workspace/ExplorerPanel.vue`
- Create: `src/components/workspace/ClaudeTasksPanel.vue`
- Create: `src/components/workspace/WorkspaceSidebar.test.ts`

- [ ] **Step 1: Write sidebar component tests**

Create `src/components/workspace/WorkspaceSidebar.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { describe, beforeEach, expect, it } from 'vitest';
import WorkspaceSidebar from './WorkspaceSidebar.vue';
import { useSidebarStore } from '../../stores/sidebarStore';

describe('WorkspaceSidebar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
  });

  it('renders the three workspace panels in the rail', () => {
    const wrapper = mount(WorkspaceSidebar, {
      global: { stubs: { ExplorerPanel: true, TerminalsPanel: true, ClaudeTasksPanel: true } },
    });

    expect(wrapper.text()).toContain('Explorer');
    expect(wrapper.text()).toContain('Terminals');
    expect(wrapper.text()).toContain('Claude');
  });

  it('switches to the terminals panel when clicked', async () => {
    const wrapper = mount(WorkspaceSidebar, {
      global: { stubs: { ExplorerPanel: true, TerminalsPanel: true, ClaudeTasksPanel: true } },
    });
    const store = useSidebarStore();

    await wrapper.get('[data-test="sidebar-panel-terminals"]').trigger('click');

    expect(store.activePanel).toBe('terminals');
  });

  it('collapses and expands without losing the active panel', async () => {
    const wrapper = mount(WorkspaceSidebar, {
      global: { stubs: { ExplorerPanel: true, TerminalsPanel: true, ClaudeTasksPanel: true } },
    });
    const store = useSidebarStore();
    store.setActivePanel('claude-tasks');

    await wrapper.get('[data-test="sidebar-toggle"]').trigger('click');
    expect(store.expanded).toBe(false);
    expect(store.activePanel).toBe('claude-tasks');

    await wrapper.get('[data-test="sidebar-toggle"]').trigger('click');
    expect(store.expanded).toBe(true);
    expect(store.activePanel).toBe('claude-tasks');
  });
});
```

- [ ] **Step 2: Run the failing component tests**

Run:

```bash
rtk npx pnpm test:run src/components/workspace/WorkspaceSidebar.test.ts
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Create the workspace shell**

Create `src/components/workspace/WorkspaceShell.vue`:

```vue
<script setup lang="ts">
import WorkspaceSidebar from './WorkspaceSidebar.vue';
</script>

<template>
  <div class="workspace-shell">
    <WorkspaceSidebar />
    <main class="workspace-main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.workspace-shell {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
  background: var(--ui-bg-light);
}

.workspace-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
</style>
```

- [ ] **Step 4: Create Explorer panel**

Create `src/components/workspace/ExplorerPanel.vue`:

```vue
<template>
  <section class="workspace-panel">
    <header class="panel-header">
      <div>
        <h2>Explorer</h2>
        <p>项目与目录入口</p>
      </div>
    </header>

    <div class="panel-section">
      <div class="section-label">Current Workspace</div>
      <div class="workspace-card">
        <span class="workspace-icon">◆</span>
        <div>
          <strong>LumiTerm</strong>
          <small>当前项目</small>
        </div>
      </div>
    </div>

    <div class="panel-section">
      <button class="panel-action" type="button">打开文件夹</button>
      <button class="panel-action secondary" type="button">最近目录</button>
    </div>
  </section>
</template>

<style scoped>
.workspace-panel { height: 100%; padding: 14px; color: var(--ui-fg); overflow: auto; }
.panel-header h2 { font-size: 14px; margin: 0 0 4px; }
.panel-header p { margin: 0; color: var(--ui-fg-muted); font-size: 12px; }
.panel-section { margin-top: 18px; display: grid; gap: 8px; }
.section-label { color: var(--ui-fg-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; }
.workspace-card { display: flex; gap: 10px; align-items: center; padding: 10px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-bg); }
.workspace-card strong, .workspace-card small { display: block; }
.workspace-card small { color: var(--ui-fg-muted); margin-top: 2px; }
.workspace-icon { color: var(--ui-accent); }
.panel-action { height: 32px; border: 1px solid var(--ui-border); border-radius: 7px; background: var(--ui-accent); color: #11111b; cursor: pointer; }
.panel-action.secondary { background: var(--ui-bg); color: var(--ui-fg); }
</style>
```

- [ ] **Step 5: Create Claude Tasks panel**

Create `src/components/workspace/ClaudeTasksPanel.vue`:

```vue
<template>
  <section class="workspace-panel">
    <header class="panel-header">
      <div>
        <h2>Claude Tasks</h2>
        <p>AI 工作流入口</p>
      </div>
    </header>

    <div class="task-card">
      <div class="task-icon">AI</div>
      <div>
        <strong>项目上下文已就绪</strong>
        <p>后续将在这里接入 Claude Code、gstack 任务和上下文管理。</p>
      </div>
    </div>

    <button class="panel-action" type="button">准备接入任务流</button>
  </section>
</template>

<style scoped>
.workspace-panel { height: 100%; padding: 14px; color: var(--ui-fg); overflow: auto; }
.panel-header h2 { font-size: 14px; margin: 0 0 4px; }
.panel-header p { margin: 0; color: var(--ui-fg-muted); font-size: 12px; }
.task-card { margin-top: 18px; display: flex; gap: 12px; padding: 12px; border: 1px solid var(--ui-border); border-radius: 10px; background: var(--ui-bg); }
.task-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: var(--ui-accent); color: #11111b; font-size: 12px; font-weight: 700; }
.task-card p { margin: 4px 0 0; color: var(--ui-fg-muted); font-size: 12px; line-height: 1.4; }
.panel-action { margin-top: 14px; width: 100%; height: 32px; border: 1px solid var(--ui-border); border-radius: 7px; background: var(--ui-bg); color: var(--ui-fg); cursor: pointer; }
</style>
```

- [ ] **Step 6: Create workspace sidebar component**

Create `src/components/workspace/WorkspaceSidebar.vue`:

```vue
<script setup lang="ts">
import { computed, onUnmounted, ref } from 'vue';
import { useSidebarStore, type SidebarPanel } from '../../stores/sidebarStore';
import ExplorerPanel from './ExplorerPanel.vue';
import TerminalsPanel from './TerminalsPanel.vue';
import ClaudeTasksPanel from './ClaudeTasksPanel.vue';

const sidebarStore = useSidebarStore();
const resizing = ref(false);
let cleanupListeners: (() => void) | null = null;

const panels: { id: SidebarPanel; label: string; icon: string }[] = [
  { id: 'explorer', label: 'Explorer', icon: 'Files' },
  { id: 'terminals', label: 'Terminals', icon: 'Term' },
  { id: 'claude-tasks', label: 'Claude', icon: 'AI' },
];

const sidebarStyle = computed(() => ({
  width: sidebarStore.expanded ? `${sidebarStore.width}px` : '52px',
}));

function onResizeDown(e: PointerEvent) {
  e.preventDefault();
  resizing.value = true;

  function onMove(ev: PointerEvent) {
    sidebarStore.setWidth(ev.clientX);
  }

  function onUp() {
    resizing.value = false;
    cleanupListeners?.();
    cleanupListeners = null;
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  cleanupListeners = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
}

onUnmounted(() => cleanupListeners?.());
</script>

<template>
  <aside class="workspace-sidebar" :class="{ collapsed: !sidebarStore.expanded }" :style="sidebarStyle">
    <nav class="sidebar-rail" aria-label="Workspace panels">
      <button
        v-for="panel in panels"
        :key="panel.id"
        class="rail-button"
        :class="{ active: sidebarStore.activePanel === panel.id }"
        :data-test="`sidebar-panel-${panel.id}`"
        type="button"
        :title="panel.label"
        @click="sidebarStore.setActivePanel(panel.id)"
      >
        <span class="rail-icon">{{ panel.icon }}</span>
        <span class="rail-label">{{ panel.label }}</span>
      </button>

      <button
        class="rail-button toggle"
        data-test="sidebar-toggle"
        type="button"
        :title="sidebarStore.expanded ? '折叠侧边栏' : '展开侧边栏'"
        @click="sidebarStore.toggleExpanded()"
      >
        <span class="rail-icon">{{ sidebarStore.expanded ? '‹' : '›' }}</span>
        <span class="rail-label">Collapse</span>
      </button>
    </nav>

    <div v-if="sidebarStore.expanded" class="sidebar-panel">
      <ExplorerPanel v-if="sidebarStore.activePanel === 'explorer'" />
      <TerminalsPanel v-else-if="sidebarStore.activePanel === 'terminals'" />
      <ClaudeTasksPanel v-else />
    </div>

    <div
      v-if="sidebarStore.expanded"
      class="sidebar-resizer"
      :class="{ resizing }"
      role="separator"
      aria-orientation="vertical"
      @pointerdown="onResizeDown"
    />
  </aside>
</template>

<style scoped>
.workspace-sidebar {
  position: relative;
  flex-shrink: 0;
  display: flex;
  min-height: 0;
  background: var(--ui-bg);
  border-right: 1px solid var(--ui-border);
  transition: width 0.16s ease;
}

.sidebar-rail {
  width: 52px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 6px;
  border-right: 1px solid var(--ui-border);
}

.rail-button {
  min-height: 36px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-fg-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  font-size: 10px;
}

.rail-button:hover { background: var(--ui-bg-light); color: var(--ui-fg); }
.rail-button.active { background: var(--ui-bg-lighter); border-color: var(--ui-border); color: var(--ui-accent); }
.rail-button.toggle { margin-top: auto; }
.rail-label { display: none; }
.sidebar-panel { flex: 1; min-width: 0; overflow: hidden; }
.sidebar-resizer { position: absolute; top: 0; right: -2px; width: 4px; height: 100%; cursor: col-resize; z-index: 2; }
.sidebar-resizer:hover, .sidebar-resizer.resizing { background: var(--ui-accent); }
</style>
```

- [ ] **Step 7: Run sidebar tests**

Run:

```bash
rtk npx pnpm test:run src/stores/sidebarStore.test.ts src/components/workspace/WorkspaceSidebar.test.ts
```

Expected: PASS.

---

## Task 4: Add Terminals panel with existing store integration

**Files:**
- Create: `src/components/workspace/TerminalsPanel.vue`
- Create: `src/components/workspace/TerminalsPanel.test.ts`

- [ ] **Step 1: Write Terminals panel tests**

Create `src/components/workspace/TerminalsPanel.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { describe, beforeEach, expect, it, vi } from 'vitest';
import TerminalsPanel from './TerminalsPanel.vue';
import { useTerminalStore } from '../../stores/terminalStore';

describe('TerminalsPanel', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${Math.random()}`) });
  });

  it('renders current terminal tabs', () => {
    const store = useTerminalStore();
    store.createTab('powershell', 'PowerShell Main');
    store.createTab('cmd', 'CMD Tools');

    const wrapper = mount(TerminalsPanel);

    expect(wrapper.text()).toContain('PowerShell Main');
    expect(wrapper.text()).toContain('CMD Tools');
  });

  it('switches tabs through the existing terminal store action', async () => {
    const store = useTerminalStore();
    const first = store.createTab('powershell', 'First');
    const second = store.createTab('cmd', 'Second');
    const wrapper = mount(TerminalsPanel);

    await wrapper.get(`[data-test="terminal-tab-${first}"]`).trigger('click');

    expect(store.activeTabId).toBe(first);
    expect(store.activeTabId).not.toBe(second);
  });

  it('creates a new PowerShell tab from the panel action', async () => {
    const store = useTerminalStore();
    store.createTab('powershell', 'Existing');
    const wrapper = mount(TerminalsPanel);

    await wrapper.get('[data-test="terminal-create-powershell"]').trigger('click');

    expect(store.tabs).toHaveLength(2);
    expect(store.tabs[1].shellType).toBe('powershell');
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
rtk npx pnpm test:run src/components/workspace/TerminalsPanel.test.ts
```

Expected: FAIL because `TerminalsPanel.vue` does not exist.

- [ ] **Step 3: Implement Terminals panel**

Create `src/components/workspace/TerminalsPanel.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useTerminalStore, type ShellType } from '../../stores/terminalStore';

const terminalStore = useTerminalStore();

const shellLabels: Record<ShellType, string> = {
  powershell: 'PowerShell',
  cmd: 'CMD',
  wsl2: 'WSL2',
};

const tabSummaries = computed(() => terminalStore.tabs.map((tab) => ({
  id: tab.id,
  title: tab.title,
  shell: shellLabels[tab.shellType],
  paneCount: tab.panes.length,
  active: tab.id === terminalStore.activeTabId,
  color: tab.color,
})));

function createPowerShellTab() {
  terminalStore.createTab('powershell');
}
</script>

<template>
  <section class="workspace-panel">
    <header class="panel-header">
      <div>
        <h2>Terminals</h2>
        <p>{{ tabSummaries.length }} 个会话</p>
      </div>
      <button
        class="icon-action"
        data-test="terminal-create-powershell"
        type="button"
        title="新建 PowerShell"
        @click="createPowerShellTab"
      >+</button>
    </header>

    <div class="terminal-list">
      <button
        v-for="tab in tabSummaries"
        :key="tab.id"
        class="terminal-item"
        :class="{ active: tab.active }"
        :data-test="`terminal-tab-${tab.id}`"
        type="button"
        @click="terminalStore.switchTab(tab.id)"
      >
        <span v-if="tab.color" class="terminal-color" :style="{ backgroundColor: tab.color }" />
        <span v-else class="terminal-color muted" />
        <span class="terminal-main">
          <strong>{{ tab.title }}</strong>
          <small>{{ tab.shell }} · {{ tab.paneCount }} pane{{ tab.paneCount > 1 ? 's' : '' }}</small>
        </span>
      </button>
    </div>
  </section>
</template>

<style scoped>
.workspace-panel { height: 100%; padding: 14px; color: var(--ui-fg); overflow: auto; }
.panel-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
.panel-header h2 { font-size: 14px; margin: 0 0 4px; }
.panel-header p { margin: 0; color: var(--ui-fg-muted); font-size: 12px; }
.icon-action { width: 28px; height: 28px; border: 1px solid var(--ui-border); border-radius: 7px; background: var(--ui-bg-light); color: var(--ui-accent); cursor: pointer; }
.terminal-list { margin-top: 14px; display: grid; gap: 8px; }
.terminal-item { width: 100%; display: flex; gap: 10px; align-items: center; text-align: left; padding: 10px; border: 1px solid var(--ui-border); border-radius: 8px; background: var(--ui-bg); color: var(--ui-fg); cursor: pointer; }
.terminal-item:hover { background: var(--ui-bg-light); }
.terminal-item.active { border-color: var(--ui-accent); background: var(--ui-bg-lighter); }
.terminal-color { width: 4px; align-self: stretch; border-radius: 999px; background: var(--ui-accent); }
.terminal-color.muted { background: var(--ui-border); }
.terminal-main { min-width: 0; }
.terminal-main strong, .terminal-main small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.terminal-main small { margin-top: 3px; color: var(--ui-fg-muted); font-size: 11px; }
</style>
```

- [ ] **Step 4: Run Terminals panel tests**

Run:

```bash
rtk npx pnpm test:run src/components/workspace/TerminalsPanel.test.ts
```

Expected: PASS.

---

## Task 5: Integrate workspace shell into App.vue

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Fix imports and add workspace shell import**

Change the top imports in `src/App.vue` to:

```ts
import { onMounted, onUnmounted, ref, computed, watchEffect } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import WorkspaceShell from './components/workspace/WorkspaceShell.vue';
import TabBar from './components/TabBar.vue';
import TerminalTab from './components/TerminalTab.vue';
import SettingsModal from './components/SettingsModal.vue';
import { useTerminalStore } from './stores/terminalStore';
import { useThemeStore } from './stores/themeStore';
import { useShortcutsStore } from './stores/shortcutsStore';
```

- [ ] **Step 2: Wrap the existing tab/terminal area in WorkspaceShell**

Replace the current `TabBar` and `.terminal-wrapper` block with:

```vue
<WorkspaceShell data-tauri-no-drag>
  <TabBar />
  <div class="terminal-wrapper">
    <TerminalTab
      v-for="tab in store.tabs"
      :key="tab.id"
      :tab-id="tab.id"
      :active="tab.id === store.activeTabId"
    />
  </div>
</WorkspaceShell>
```

The surrounding titlebar and `SettingsModal` stay unchanged.

- [ ] **Step 3: Keep terminal wrapper as flex child**

Keep this CSS rule in `src/App.vue`:

```css
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
```

- [ ] **Step 4: Run unit tests and type build**

Run:

```bash
rtk npx pnpm test:run && rtk npx pnpm build
```

Expected: tests PASS and build succeeds.

---

## Task 6: Add resize and persistence verification coverage

**Files:**
- Modify: `src/components/workspace/WorkspaceSidebar.test.ts`

- [ ] **Step 1: Add resize behavior test**

Append this test to `src/components/workspace/WorkspaceSidebar.test.ts`:

```ts
it('resizes the expanded sidebar within store bounds', async () => {
  const wrapper = mount(WorkspaceSidebar, {
    global: { stubs: { ExplorerPanel: true, TerminalsPanel: true, ClaudeTasksPanel: true } },
  });
  const store = useSidebarStore();

  await wrapper.get('.sidebar-resizer').trigger('pointerdown', { clientX: 260 });
  document.dispatchEvent(new PointerEvent('pointermove', { clientX: 360 }));
  document.dispatchEvent(new PointerEvent('pointerup'));

  expect(store.width).toBe(360);
});
```

- [ ] **Step 2: Run sidebar tests**

Run:

```bash
rtk npx pnpm test:run src/components/workspace/WorkspaceSidebar.test.ts
```

Expected: PASS. If jsdom lacks `PointerEvent`, add this to `src/test/setup.ts`:

```ts
if (!globalThis.PointerEvent) {
  globalThis.PointerEvent = MouseEvent as unknown as typeof PointerEvent;
}
```

Then rerun the same test command.

---

## Task 7: Add project artifact hygiene

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Ignore visual brainstorming artifacts**

Ensure `.gitignore` contains:

```gitignore
# Local visual brainstorming artifacts
.superpowers/
```

- [ ] **Step 2: Verify git only shows intended files**

Run:

```bash
rtk git status --short
```

Expected: new/modified files are limited to implementation files, test files, package files, the approved spec/plan files, and pre-existing user changes.

---

## Task 8: Manual UI verification with gstack/browser

**Files:**
- No source edits unless verification finds a bug.

- [ ] **Step 1: Start the Tauri dev app**

Run:

```bash
rtk npx pnpm tauri dev
```

Expected: LumiTerm launches and shows the titlebar, workspace sidebar, tab bar, and terminal.

- [ ] **Step 2: Verify golden terminal path**

In the launched app:

```powershell
echo 你好世界
```

Expected: Chinese output renders correctly and input focus remains in the terminal.

- [ ] **Step 3: Verify sidebar interactions**

Use the app UI:

1. Click Explorer, Terminals, Claude.
2. Collapse the sidebar.
3. Expand the sidebar.
4. Drag the sidebar width.
5. Restart the app.

Expected: panel choice, expanded state, and width persist after restart.

- [ ] **Step 4: Verify terminal session actions from sidebar**

Use the Terminals panel:

1. Create a PowerShell tab from the panel.
2. Switch between existing tabs from the panel.
3. Split a tab using existing shortcut `Ctrl+Shift+D`.
4. Confirm the Terminals panel shows the split tab as `2 panes`.

Expected: existing terminal tabs and panes keep working; no PTY crash or blank terminal.

---

## Task 9: Final verification

**Files:**
- No source edits unless verification finds a bug.

- [ ] **Step 1: Run frontend tests**

Run:

```bash
rtk npx pnpm test:run
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 3: Run Rust check**

Run:

```bash
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS or no new Rust-related failures. Since this feature should not touch Rust, any Rust failure should be recorded separately unless caused by workspace changes.

- [ ] **Step 4: Review diff**

Run:

```bash
rtk git diff
```

Expected: diff shows workspace sidebar, tests, config, and `.gitignore` hygiene only. `TerminalPane.vue` and Rust PTY files should not be modified.

---

## NOT in scope

- Full file tree and file operations — Explorer MVP only creates the stable place for that work.
- Claude Code / gstack task orchestration — Claude Tasks MVP only creates the product surface.
- PTY lifecycle hardening — important, but separate from sidebar delivery.
- CSP production hardening — important before release, not needed to prove the workspace sidebar.
- Replacing global window events — should be reduced over time, but this feature does not need to touch terminal copy/paste/focus events.

## Failure Modes to Watch

```
Sidebar store
  ├── invalid localStorage JSON       -> covered by sidebarStore.test.ts
  ├── width too small/large           -> covered by sidebarStore.test.ts
  └── localStorage unavailable        -> caught in store, no user-visible crash

Workspace sidebar
  ├── collapsed state hides panel     -> covered by WorkspaceSidebar.test.ts
  ├── resize listener leaks           -> cleanup in onUnmounted, manual QA watches drag behavior
  └── active panel lost on collapse   -> covered by WorkspaceSidebar.test.ts

Terminals panel
  ├── no tabs                         -> should render empty list without crash
  ├── tab switch calls wrong action   -> covered by TerminalsPanel.test.ts
  └── create tab breaks existing flow -> covered by TerminalsPanel.test.ts + manual PTY QA

App integration
  ├── terminal loses available space  -> manual Tauri resize/focus QA
  ├── titlebar drag captures sidebar  -> `data-tauri-no-drag` on WorkspaceShell
  └── existing keyboard shortcuts fail -> manual golden path QA
```

## Parallelization Strategy

Sequential implementation is recommended. The work is UI-shell heavy and most tasks touch `src/components/workspace/`, `src/App.vue`, and shared stores. Parallel worktrees would create avoidable merge conflicts for a small first slice.

## Implementation Handoff

Use subagent-driven development for implementation if possible:

1. One subagent implements Task 1-2 and stops for review.
2. One subagent implements Task 3-4 and stops for review.
3. Inline/main session integrates Task 5 and runs verification.

If doing inline execution, complete tasks in order. Do not start Task 5 until Task 2-4 tests pass.
