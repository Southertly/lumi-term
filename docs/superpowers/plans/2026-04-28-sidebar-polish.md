# Sidebar Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the existing Warp-style sidebar with a native-feeling top collapse button, correct default session visibility, non-destructive all-session closing, and a Windows drive/folder workspace picker.

**Architecture:** Keep sidebar UI ownership in `SidebarPanel.vue`, keep workspace/session state in `terminalStore.ts`, and expose folder browsing through small Tauri commands backed by Rust filesystem helpers. Session closing removes tabs and lets `TerminalPane` unmount cleanup close PTYs; only the titlebar close button exits the app.

**Tech Stack:** Vue 3 Composition API, Pinia, Tauri 2 `invoke`, Rust std filesystem APIs, existing xterm.js terminal panes.

---

## File Structure

- Modify `src-tauri/src/services/pty_service.rs`
  - Add serializable `WorkspaceEntry` and helper functions for validating paths, listing Windows drives, and listing child directories.
  - Keep inaccessible child directories skipped instead of failing whole listings.
  - Add Rust unit tests around validation and directory-listing behavior.

- Modify `src-tauri/src/commands/pty.rs`
  - Export Tauri commands `list_workspace_roots`, `list_workspace_children`, and keep `validate_workspace_path` delegating to backend validation.

- Modify `src-tauri/src/lib.rs`
  - Register the new workspace picker commands in `tauri::generate_handler!`.

- Modify `src/stores/terminalStore.ts`
  - Ensure no-cwd/default/legacy tabs remain visible in `tabsForCurrentWorkspace` when there is a selected workspace.
  - Ensure last-tab close leaves `activeTabId` as `null` and preserves `currentWorkspacePath`.

- Modify `src/components/SidebarPanel.vue`
  - Replace edge collapse tab with a top 44×44 Panel Toggle SVG button.
  - Remove `close_app` from sidebar session close.
  - Add empty-session state with a visible “New PowerShell” action.
  - Replace simple recent-path menu with input + drive/folder browser + filtering + validation error UI.

- Modify `src/components/TabBar.vue`
  - Remove `close_app` from tab close paths.

- Modify `src/App.vue`
  - Remove `closeApp()` from close-tab keyboard shortcuts.
  - Add neutral empty terminal placeholder when no tabs remain.

---

### Task 1: Add Rust workspace browsing helpers

**Files:**
- Modify: `src-tauri/src/services/pty_service.rs`

- [ ] **Step 1: Add failing tests for path validation and child directory listing**

Add these tests inside the existing `#[cfg(test)] mod tests` in `src-tauri/src/services/pty_service.rs`:

```rust
use super::{list_workspace_children_entries, validate_workspace_directory};
use std::fs;

#[test]
fn validates_existing_workspace_directory() {
    let cwd = std::env::current_dir().unwrap();

    let canonical = validate_workspace_directory(&cwd.to_string_lossy()).unwrap();

    assert_eq!(canonical, cwd.canonicalize().unwrap());
}

#[test]
fn rejects_file_as_workspace_directory() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-file-workspace-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("not-a-folder.txt");
    fs::write(&file, "not a directory").unwrap();

    let error = validate_workspace_directory(&file.to_string_lossy()).unwrap_err();

    assert!(error.contains("workspace path is not a directory"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn lists_child_directories_without_files() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-workspace-children-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(root.join("folder-a")).unwrap();
    fs::create_dir_all(root.join("folder-b")).unwrap();
    fs::write(root.join("file.txt"), "ignored").unwrap();

    let entries = list_workspace_children_entries(root.to_string_lossy().to_string()).unwrap();
    let names: Vec<_> = entries.iter().map(|entry| entry.name.as_str()).collect();

    assert_eq!(names, vec!["folder-a", "folder-b"]);
    assert!(entries.iter().all(|entry| entry.kind == "folder"));
    fs::remove_dir_all(root).unwrap();
}
```

- [ ] **Step 2: Run tests and verify they fail because helpers do not exist**

Run:

```bash
rtk cargo test --manifest-path src-tauri/Cargo.toml workspace
```

Expected: FAIL with unresolved imports/functions for `WorkspaceEntry`, `validate_workspace_directory`, or `list_workspace_children_entries`.

- [ ] **Step 3: Implement minimal backend helpers**

In `src-tauri/src/services/pty_service.rs`, add imports and types near the top:

```rust
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct WorkspaceEntry {
    pub name: String,
    pub path: String,
    pub kind: String,
}
```

Replace the existing `canonicalize_working_directory` body with a shared validator plus compatibility wrapper:

```rust
pub fn validate_workspace_directory(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("workspace path is empty".to_string());
    }

    let path = Path::new(trimmed);
    if !path.exists() {
        return Err(format!("workspace path does not exist: {}", trimmed));
    }
    if !path.is_dir() {
        return Err(format!("workspace path is not a directory: {}", trimmed));
    }

    path.canonicalize()
        .map_err(|e| format!("failed to resolve workspace path {}: {}", trimmed, e))
}

pub fn canonicalize_working_directory(cwd: &str) -> Result<PathBuf, String> {
    validate_workspace_directory(cwd)
}
```

Add drive and child listing helpers below the validation helpers:

```rust
pub fn list_workspace_root_entries() -> Result<Vec<WorkspaceEntry>, String> {
    let mut entries = Vec::new();

    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:", letter as char);
            let root = format!("{}\\", drive);
            let path = Path::new(&root);
            if path.is_dir() {
                entries.push(WorkspaceEntry {
                    name: drive,
                    path: root,
                    kind: "drive".to_string(),
                });
            }
        }
    }

    #[cfg(not(windows))]
    {
        entries.push(WorkspaceEntry {
            name: "/".to_string(),
            path: "/".to_string(),
            kind: "drive".to_string(),
        });
    }

    Ok(entries)
}

pub fn list_workspace_children_entries(path: String) -> Result<Vec<WorkspaceEntry>, String> {
    let root = validate_workspace_directory(&path)?;
    let mut entries = Vec::new();

    for entry in fs::read_dir(&root).map_err(|e| format!("failed to read directory {}: {}", root.display(), e))? {
        let Ok(entry) = entry else { continue };
        let Ok(file_type) = entry.file_type() else { continue };
        if !file_type.is_dir() {
            continue;
        }

        let child_path = entry.path();
        entries.push(WorkspaceEntry {
            name: entry.file_name().to_string_lossy().to_string(),
            path: child_path.to_string_lossy().to_string(),
            kind: "folder".to_string(),
        });
    }

    entries.sort_by_key(|entry| entry.name.to_lowercase());
    Ok(entries)
}
```

- [ ] **Step 4: Run tests and verify they pass**

Run:

```bash
rtk cargo test --manifest-path src-tauri/Cargo.toml workspace
```

Expected: PASS for the new workspace tests.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
rtk git add src-tauri/src/services/pty_service.rs && rtk git commit -m "feat: add workspace directory browsing helpers"
```

---

### Task 2: Expose workspace browsing Tauri commands

**Files:**
- Modify: `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add command-layer imports and command functions**

In `src-tauri/src/commands/pty.rs`, extend the existing `pty_service` import to include:

```rust
list_workspace_children_entries, list_workspace_root_entries, WorkspaceEntry,
```

Add these Tauri commands near `validate_workspace_path`:

```rust
#[tauri::command]
pub fn list_workspace_roots() -> Result<Vec<WorkspaceEntry>, String> {
    list_workspace_root_entries()
}

#[tauri::command]
pub fn list_workspace_children(path: String) -> Result<Vec<WorkspaceEntry>, String> {
    list_workspace_children_entries(path)
}
```

Keep `validate_workspace_path` as:

```rust
#[tauri::command]
pub fn validate_workspace_path(path: String) -> Result<String, String> {
    canonicalize_working_directory(&path).map(|path| path.to_string_lossy().to_string())
}
```

- [ ] **Step 2: Register the new commands**

In `src-tauri/src/lib.rs`, add these names to the `use commands::pty::{...}` list:

```rust
list_workspace_children, list_workspace_roots,
```

Add them to `tauri::generate_handler![...]`:

```rust
list_workspace_roots,
list_workspace_children,
validate_workspace_path
```

- [ ] **Step 3: Run Rust check**

Run:

```bash
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS with no errors.

- [ ] **Step 4: Commit Task 2**

Run:

```bash
rtk git add src-tauri/src/commands/pty.rs src-tauri/src/lib.rs && rtk git commit -m "feat: expose workspace browsing commands"
```

---

### Task 3: Fix session filtering and last-tab store behavior

**Files:**
- Modify: `src/stores/terminalStore.ts`

- [ ] **Step 1: Add or update store behavior tests if the project has a frontend test harness**

If frontend tests already exist, add tests covering these behaviors:

```ts
it('shows tabs without cwd in the current workspace session list', () => {
  const store = useTerminalStore();
  store.createTab('powershell', 'PowerShell', undefined);
  store.setCurrentWorkspace('E:/claudecode/lumi-term');

  expect(store.tabsForCurrentWorkspace.map((tab) => tab.title)).toContain('PowerShell');
});

it('closing the last tab leaves the workspace selected and active tab empty', () => {
  const store = useTerminalStore();
  store.setCurrentWorkspace('E:/claudecode/lumi-term');
  store.createTab('powershell', 'PowerShell', 'E:/claudecode/lumi-term');
  const tabId = store.activeTabId!;

  store.removeTab(tabId);

  expect(store.activeTabId).toBeNull();
  expect(store.currentWorkspacePath).toBe('E:/claudecode/lumi-term');
});
```

If there is no frontend test harness, write the production change in Step 3 and verify through build plus manual checks in Task 7.

- [ ] **Step 2: Run the targeted frontend tests if added**

Run the project’s existing frontend test command if available. If no test command exists, skip to Step 3 and document “no frontend test harness” in the task handoff.

- [ ] **Step 3: Update `tabsForCurrentWorkspace`**

Change `tabsForCurrentWorkspace` in `src/stores/terminalStore.ts` to include no-cwd tabs when a workspace is selected:

```ts
const tabsForCurrentWorkspace = computed(() => {
  if (!currentWorkspacePath.value) return tabs.value;
  return tabs.value.filter((tab) => !tab.cwd || tab.cwd === currentWorkspacePath.value);
});
```

Verify `removeTab` leaves `activeTabId` as `null` when no tabs remain and does not mutate `currentWorkspacePath`. The intended active-tab selection is:

```ts
if (activeTabId.value === id) {
  const nextInWorkspace = currentWorkspacePath.value
    ? tabs.value.find((candidate) => !candidate.cwd || candidate.cwd === currentWorkspacePath.value)
    : null;
  const next = nextInWorkspace ?? tabs.value[index] ?? tabs.value[index - 1] ?? null;
  activeTabId.value = next?.id ?? null;
}
```

- [ ] **Step 4: Run frontend type/build check**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
rtk git add src/stores/terminalStore.ts && rtk git commit -m "fix: keep default sessions visible in sidebar"
```

---

### Task 4: Make all session close paths non-destructive

**Files:**
- Modify: `src/components/SidebarPanel.vue`
- Modify: `src/components/TabBar.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Remove sidebar app-exit behavior**

In `src/components/SidebarPanel.vue`, change `closeSession` so it only removes the tab:

```ts
const closeSession = (event: MouseEvent | KeyboardEvent, tab: Tab) => {
  event.preventDefault();
  event.stopPropagation();
  if (!confirm(`关闭 ${tab.title}？`)) return;
  store.removeTab(tab.id);
};
```

- [ ] **Step 2: Remove top TabBar app-exit behavior**

In `src/components/TabBar.vue`, update `closeTab` to:

```ts
function closeTab(e: MouseEvent, tabId: string) {
  e.stopPropagation();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (confirm(`关闭 ${tab.title}？`)) {
    store.removeTab(tabId);
  }
}
```

Update `handleCloseTab` to:

```ts
function handleCloseTab() {
  if (!contextMenuState.value) return;
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;
  if (confirm(`关闭 ${tab.title}？`)) {
    store.removeTab(tabId);
  }
}
```

- [ ] **Step 3: Remove keyboard shortcut app-exit behavior**

In `src/App.vue`, keep the titlebar `closeApp()` function unchanged, but remove `closeApp()` calls from close-tab shortcuts.

For the configured close-tab shortcut branch, the body should be:

```ts
if (shortcutsStore.matchesEvent('close-tab', e)) {
  e.preventDefault();
  if (store.activeTabId) {
    const tab = store.tabs.find((t) => t.id === store.activeTabId);
    if (tab && confirm(`关闭 ${tab.title}？`)) {
      store.removeTab(store.activeTabId);
    }
  }
  return;
}
```

For the `Ctrl+Shift+W` fallback branch, remove any `if (store.tabs.length === 0) closeApp();` line after `store.removeTab(...)`.

- [ ] **Step 4: Run frontend build check**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
rtk git add src/components/SidebarPanel.vue src/components/TabBar.vue src/App.vue && rtk git commit -m "fix: keep app open when closing all sessions"
```

---

### Task 5: Replace collapse control and add empty session state

**Files:**
- Modify: `src/components/SidebarPanel.vue`
- Modify: `src/App.vue`

- [ ] **Step 1: Move collapse button into sidebar header**

In `src/components/SidebarPanel.vue`, remove the edge-mounted `collapse-toggle` button from the root sidebar body.

Add a header section above the workspace selector:

```vue
<div class="sidebar-topbar">
  <button
    class="sidebar-toggle-button"
    type="button"
    :title="store.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
    :aria-label="store.sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'"
    :aria-pressed="store.sidebarCollapsed"
    @click="toggleSidebar"
  >
    <svg
      class="sidebar-toggle-icon"
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
```

- [ ] **Step 2: Add collapse button CSS**

Add CSS using existing `--ui-*` tokens:

```css
.sidebar-topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-bottom: 1px solid var(--ui-border);
}

.sidebar-toggle-button {
  width: 44px;
  height: 44px;
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  background: var(--ui-surface);
  color: var(--ui-accent);
  display: grid;
  place-items: center;
  cursor: pointer;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.22);
  transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.sidebar-toggle-button:hover,
.sidebar-toggle-button:focus-visible {
  border-color: var(--ui-accent);
  background: var(--ui-surface-hover);
  outline: none;
}

.sidebar-toggle-button:active {
  transform: translateY(1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.sidebar-toggle-icon {
  transition: transform 180ms ease;
}

.sidebar-toggle-icon.is-collapsed {
  transform: scaleX(-1);
}

.sidebar-topbar-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--ui-text);
}
```

If this project uses different token names, map to the closest existing tokens already used in `SidebarPanel.vue`; do not introduce raw color values except for shadow alpha.

- [ ] **Step 3: Add sidebar empty state**

In the session list section of `src/components/SidebarPanel.vue`, render an empty state when `store.tabsForCurrentWorkspace.length === 0`:

```vue
<div v-if="store.tabsForCurrentWorkspace.length === 0 && !store.sidebarCollapsed" class="sessions-empty">
  <div class="sessions-empty-title">暂无 Session</div>
  <button class="sessions-empty-action" type="button" @click="createSession('powershell')">
    New PowerShell
  </button>
</div>
```

Keep the existing session rows under `v-else`.

- [ ] **Step 4: Add terminal placeholder when all tabs are closed**

In `src/App.vue`, inside `.terminal-wrapper`, add a placeholder before or after the `TerminalTab` loop:

```vue
<div v-if="store.tabs.length === 0" class="terminal-empty-state">
  <div class="terminal-empty-card">
    <div class="terminal-empty-title">暂无 Session</div>
    <div class="terminal-empty-text">从左侧创建一个新的 PowerShell Session。</div>
  </div>
</div>
```

Keep the existing `TerminalTab v-for` for non-empty state.

Add CSS in `App.vue`:

```css
.terminal-empty-state {
  flex: 1;
  display: grid;
  place-items: center;
  color: var(--ui-text-muted);
  background: var(--ui-bg);
}

.terminal-empty-card {
  border: 1px solid var(--ui-border);
  border-radius: 14px;
  background: var(--ui-surface);
  padding: 18px 22px;
  text-align: center;
}

.terminal-empty-title {
  color: var(--ui-text);
  font-size: 14px;
  font-weight: 700;
  margin-bottom: 6px;
}

.terminal-empty-text {
  font-size: 12px;
}
```

Use existing token names from `App.vue`; adjust names only if these tokens do not exist.

- [ ] **Step 5: Run frontend build check**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

Run:

```bash
rtk git add src/components/SidebarPanel.vue src/App.vue && rtk git commit -m "feat: polish sidebar collapse and empty states"
```

---

### Task 6: Add combined workspace input and folder browser UI

**Files:**
- Modify: `src/components/SidebarPanel.vue`

- [ ] **Step 1: Add workspace entry type and browser state**

In `src/components/SidebarPanel.vue`, add this type near imports/state:

```ts
interface WorkspaceEntry {
  name: string;
  path: string;
  kind: 'drive' | 'folder';
}
```

Replace the simple workspace menu state with:

```ts
const workspaceInput = ref('');
const workspaceMenuOpen = ref(false);
const workspaceError = ref('');
const workspaceEntries = ref<WorkspaceEntry[]>([]);
const browsedWorkspacePath = ref<string | null>(null);
const workspaceLoading = ref(false);
```

Add filtered candidates:

```ts
const filteredWorkspaceEntries = computed(() => {
  const query = workspaceInput.value.trim().toLowerCase();
  if (!query) return workspaceEntries.value;
  return workspaceEntries.value.filter((entry) => {
    return entry.name.toLowerCase().includes(query) || entry.path.toLowerCase().includes(query);
  });
});
```

- [ ] **Step 2: Add browser loading methods**

Add these methods:

```ts
const loadWorkspaceRoots = async () => {
  workspaceLoading.value = true;
  workspaceError.value = '';
  browsedWorkspacePath.value = null;
  try {
    workspaceEntries.value = await invoke<WorkspaceEntry[]>('list_workspace_roots');
  } catch (error) {
    workspaceEntries.value = [];
    workspaceError.value = String(error);
  } finally {
    workspaceLoading.value = false;
  }
};

const loadWorkspaceChildren = async (path: string) => {
  workspaceLoading.value = true;
  workspaceError.value = '';
  try {
    workspaceEntries.value = await invoke<WorkspaceEntry[]>('list_workspace_children', { path });
    browsedWorkspacePath.value = path;
    workspaceInput.value = path;
  } catch (error) {
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
    void loadWorkspaceRoots();
  }
};

const browseWorkspaceEntry = (entry: WorkspaceEntry) => {
  void loadWorkspaceChildren(entry.path);
};
```

If a function named `toggleWorkspaceMenu` already exists, replace its implementation with `openWorkspaceMenu` behavior or rename calls consistently.

- [ ] **Step 3: Update workspace submission**

Use the typed path first, then browsed path:

```ts
const setWorkspaceFromInput = () => {
  const path = workspaceInput.value.trim() || browsedWorkspacePath.value;
  if (!path) return;
  void setWorkspace(path);
};
```

Keep `setWorkspace` validating through `validate_workspace_path` before calling `store.setCurrentWorkspace(canonicalPath)`.

- [ ] **Step 4: Replace workspace menu template**

Replace the current recent-path-only workspace menu with:

```vue
<div v-if="workspaceMenuOpen && !store.sidebarCollapsed" class="workspace-menu">
  <form class="workspace-form" @submit.prevent="setWorkspaceFromInput">
    <input
      v-model="workspaceInput"
      class="workspace-input"
      placeholder="输入或选择工作目录"
      aria-label="工作目录路径"
    />
    <button class="workspace-submit" type="submit">切换</button>
  </form>

  <div v-if="workspaceError" class="workspace-error">{{ workspaceError }}</div>

  <div v-if="workspaceLoading" class="workspace-empty">正在读取文件夹…</div>

  <div v-else class="workspace-browser" role="listbox" aria-label="工作目录候选">
    <button
      v-for="entry in filteredWorkspaceEntries"
      :key="entry.path"
      class="workspace-browser-item"
      type="button"
      role="option"
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
```

- [ ] **Step 5: Add browser CSS**

Add CSS that keeps rows keyboard/click accessible and avoids files entirely because backend only returns folders/drives:

```css
.workspace-browser {
  display: grid;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
  margin-top: 8px;
}

.workspace-browser-item {
  width: 100%;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: var(--ui-text);
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 2px 8px;
  padding: 8px;
  text-align: left;
  cursor: pointer;
}

.workspace-browser-item:hover,
.workspace-browser-item:focus-visible {
  border-color: var(--ui-accent);
  background: var(--ui-surface-hover);
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
  color: var(--ui-text-muted);
  font-size: 11px;
}

.workspace-recent {
  display: grid;
  gap: 4px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--ui-border);
}
```

Use existing token names from the file if they differ.

- [ ] **Step 6: Run frontend build check**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

Run:

```bash
rtk git add src/components/SidebarPanel.vue && rtk git commit -m "feat: add workspace folder browser"
```

---

### Task 7: Full verification and manual UI check

**Files:**
- Verify only; no planned code changes unless failures require fixes.

- [ ] **Step 1: Run frontend build**

Run:

```bash
rtk npx pnpm build
```

Expected: PASS.

- [ ] **Step 2: Run Rust check**

Run:

```bash
rtk cargo check --manifest-path src-tauri/Cargo.toml
```

Expected: PASS.

- [ ] **Step 3: Run Rust tests**

Run:

```bash
rtk cargo test --manifest-path src-tauri/Cargo.toml workspace
```

Expected: PASS for workspace validation/listing tests.

- [ ] **Step 4: Launch the app for manual verification**

Run:

```bash
rtk npx pnpm tauri dev
```

Manual checks:

1. Sidebar collapse button uses the Panel Toggle SVG icon at the top.
2. Toggle collapse/expand and confirm terminal output is preserved.
3. Fresh state shows default PowerShell in the left session list.
4. Closing all sessions from sidebar keeps the app window open.
5. Closing all sessions from top TabBar keeps the app window open.
6. Close-tab keyboard shortcut keeps the app window open when it removes the last session.
7. Titlebar close button still exits the app.
8. Sidebar empty state shows “暂无 Session” and “New PowerShell”.
9. Empty terminal area shows a neutral placeholder.
10. Workspace picker opens with available drives.
11. Selecting a drive shows folders only.
12. Selecting a folder enters that folder and shows child folders only.
13. Typing filters visible candidates.
14. Submitting a valid path changes workspace.
15. Submitting an invalid path shows an inline error and does not update recent paths.
16. Creating a new session after workspace selection starts it in that directory.

- [ ] **Step 5: Fix any verification failures with the smallest change**

If a check fails, do not bundle unrelated polish. Fix only the failing behavior, rerun the failing verification, then rerun the relevant build/check command.

- [ ] **Step 6: Commit verification fixes if any were needed**

If Task 7 required code changes, commit them:

```bash
rtk git add <changed-files> && rtk git commit -m "fix: resolve sidebar polish verification issues"
```

If no code changes were needed, do not create an empty commit.

---

## Self-review

- Spec coverage: collapse button, default/no-cwd sessions, non-destructive all-session close, empty state, folder picker, validation, and drive/folder-only browsing are all mapped to tasks.
- Placeholder scan: no TODO/TBD placeholders are used as implementation instructions.
- Scope check: focused on sidebar polish only; no TabBar removal, command palette, or Warp Blocks behavior.
- Type consistency: `WorkspaceEntry` uses `name`, `path`, and `kind: 'drive' | 'folder'` consistently across Rust and Vue.
- Verification: plan requires frontend build, Rust check, Rust tests, and manual UI verification before completion claims.
