# LumiTerm File Editor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first LumiTerm text editor flow: double-click a file in the left tree, edit it in an upper textarea tab pane, save with Ctrl+S, and keep the existing terminal workflow below it.

**Architecture:** Add safe UTF-8 text-file read/write commands in the existing Rust command/service layer. Add a dedicated Pinia `editorStore` and a focused `FileEditorPane.vue`, then wire `FileTreeNode.vue`, `SidebarPanel.vue`, and `App.vue` without changing PTY/xterm internals.

**Tech Stack:** Tauri v2, Rust, Vue 3 `<script setup lang="ts">`, Pinia, Vitest, Vue Test Utils, xterm.js.

---

## File Structure

- Create `src/stores/editorStore.ts`
  - Owns editor tabs, active editor path, dirty tracking, read/save actions, and close confirmation.
- Create `src/stores/editorStore.test.ts`
  - Tests editor store behavior with mocked Tauri `invoke`.
- Create `src/components/FileEditorPane.vue`
  - Renders editor tab strip, toolbar/status, textarea, dirty markers, close buttons, and save button.
- Create `src/components/FileEditorPane.test.ts`
  - Tests rendering, editing, switching, saving, and closing behavior.
- Modify `src/components/FileTreeNode.vue`
  - File double-click emits `open-file`; folder click still expands; rename remains in context menu.
- Create `src/components/FileTreeNode.test.ts`
  - Tests double-click open behavior and recursive event forwarding.
- Modify `src/components/SidebarPanel.vue`
  - Imports `useEditorStore`, handles `open-file` from tree nodes, keeps current Explorer layout.
- Modify `src/components/SidebarPanel.test.ts`
  - Updates FileTreeNode stub to emit `open-file`; verifies sidebar calls `editorStore.openFile`.
- Modify `src/App.vue`
  - Adds `FileEditorPane` above terminal workspace, wires Ctrl+S to editor save, updates stale empty-state copy.
- Modify `src-tauri/src/services/pty_service.rs`
  - Adds `TextFilePayload`, `MAX_TEXT_FILE_BYTES`, `read_text_file`, and `write_text_file` helpers plus Rust unit tests.
- Modify `src-tauri/src/commands/pty.rs`
  - Exposes `read_text_file_cmd` and `write_text_file_cmd` Tauri commands.
- Modify `src-tauri/src/lib.rs`
  - Registers new Tauri commands.

## Task 1: Backend text file commands

**Files:**
- Modify: `src-tauri/src/services/pty_service.rs`
- Modify: `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add failing Rust tests for text-file helpers**

In `src-tauri/src/services/pty_service.rs`, update the test import block around the existing `mod tests` import list so it includes the new helpers:

```rust
use super::{
    build_shell_command, canonicalize_working_directory, cmd_cwd_init_input, display_path,
    display_working_directory, list_directory_entries, list_workspace_children_entries,
    list_workspace_root_entries, path_for_cmd, read_text_file, shell_working_directory,
    validate_workspace_directory, write_text_file, MAX_TEXT_FILE_BYTES,
};
```

Add these tests before the closing brace of `mod tests`:

```rust
#[test]
fn reads_utf8_text_file() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-read-text-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("note.txt");
    fs::write(&file, "hello 世界").unwrap();

    let payload = read_text_file(file.to_string_lossy().to_string()).unwrap();

    assert_eq!(payload.name, "note.txt");
    assert_eq!(payload.content, "hello 世界");
    assert!(payload.path.ends_with("note.txt"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_directory_as_text_file() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-read-dir-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();

    let error = read_text_file(root.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("path is not a file"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_missing_text_file() {
    let missing = std::env::temp_dir().join(format!(
        "lumiterm-missing-text-{}.txt",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));

    let error = read_text_file(missing.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("path does not exist"));
}

#[test]
fn rejects_large_text_file() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-large-text-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("large.txt");
    fs::write(&file, vec![b'a'; MAX_TEXT_FILE_BYTES + 1]).unwrap();

    let error = read_text_file(file.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("file is too large"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_invalid_utf8_text_file() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-invalid-utf8-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("binary.bin");
    fs::write(&file, vec![0xff, 0xfe, 0xfd]).unwrap();

    let error = read_text_file(file.to_string_lossy().to_string()).unwrap_err();

    assert!(error.contains("file is not valid UTF-8"));
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn writes_utf8_text_file() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-write-text-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("note.txt");
    fs::write(&file, "old").unwrap();

    write_text_file(file.to_string_lossy().to_string(), "new 世界".to_string()).unwrap();

    assert_eq!(fs::read_to_string(&file).unwrap(), "new 世界");
    fs::remove_dir_all(root).unwrap();
}

#[test]
fn rejects_large_text_write() {
    let root = std::env::temp_dir().join(format!(
        "lumiterm-large-write-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos()
    ));
    fs::create_dir_all(&root).unwrap();
    let file = root.join("note.txt");
    fs::write(&file, "old").unwrap();

    let error = write_text_file(
        file.to_string_lossy().to_string(),
        "a".repeat(MAX_TEXT_FILE_BYTES + 1),
    ).unwrap_err();

    assert!(error.contains("content is too large"));
    assert_eq!(fs::read_to_string(&file).unwrap(), "old");
    fs::remove_dir_all(root).unwrap();
}
```

- [ ] **Step 2: Run Rust tests and verify they fail**

Run from the worktree root:

```bash
rtk cargo test --manifest-path "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/Cargo.toml" read_text_file
```

Expected: FAIL with unresolved imports/functions for `read_text_file`, `write_text_file`, or `MAX_TEXT_FILE_BYTES`.

- [ ] **Step 3: Add text-file payload and helpers**

In `src-tauri/src/services/pty_service.rs`, after `FileEntry`, add:

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextFilePayload {
    pub path: String,
    pub name: String,
    pub content: String,
}

pub const MAX_TEXT_FILE_BYTES: usize = 1024 * 1024;
```

After `delete_path`, add:

```rust
fn canonicalize_text_file(path: &str) -> Result<PathBuf, String> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return Err("file path is empty".to_string());
    }

    let normalized = trimmed.strip_prefix("/?/").unwrap_or(trimmed);
    let path = Path::new(normalized);
    if !path.exists() {
        return Err(format!("path does not exist: {}", trimmed));
    }
    if !path.is_file() {
        return Err(format!("path is not a file: {}", trimmed));
    }

    path.canonicalize()
        .map_err(|e| format!("failed to resolve file path {}: {}", trimmed, e))
}

pub fn read_text_file(path: String) -> Result<TextFilePayload, String> {
    let file_path = canonicalize_text_file(&path)?;
    let metadata = fs::metadata(&file_path)
        .map_err(|e| format!("failed to read file metadata {}: {}", path, e))?;
    if metadata.len() > MAX_TEXT_FILE_BYTES as u64 {
        return Err(format!("file is too large: max {} bytes", MAX_TEXT_FILE_BYTES));
    }

    let bytes = fs::read(&file_path)
        .map_err(|e| format!("failed to read file {}: {}", path, e))?;
    let content = String::from_utf8(bytes)
        .map_err(|_| "file is not valid UTF-8".to_string())?;
    let name = file_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    Ok(TextFilePayload {
        path: display_path(&file_path),
        name,
        content,
    })
}

pub fn write_text_file(path: String, content: String) -> Result<(), String> {
    if content.len() > MAX_TEXT_FILE_BYTES {
        return Err(format!("content is too large: max {} bytes", MAX_TEXT_FILE_BYTES));
    }

    let file_path = canonicalize_text_file(&path)?;
    fs::write(&file_path, content)
        .map_err(|e| format!("failed to write file {}: {}", path, e))
}
```

- [ ] **Step 4: Add Tauri command wrappers**

In `src-tauri/src/commands/pty.rs`, extend the service import list:

```rust
read_text_file, rename_path, resize_pty, search_files, spawn_shell, write_pty,
write_text_file, FileEntry, PtyStore, TextFilePayload, WorkspaceEntry,
```

Add these command functions after `delete_path_cmd`:

```rust
#[tauri::command]
pub fn read_text_file_cmd(path: String) -> Result<TextFilePayload, String> {
    read_text_file(path)
}

#[tauri::command]
pub fn write_text_file_cmd(path: String, content: String) -> Result<(), String> {
    write_text_file(path, content)
}
```

- [ ] **Step 5: Register commands in Tauri**

In `src-tauri/src/lib.rs`, add `read_text_file_cmd` and `write_text_file_cmd` to the `use commands::pty::{...};` list.

Also add them to `tauri::generate_handler![...]` after `delete_path_cmd`:

```rust
delete_path_cmd,
read_text_file_cmd,
write_text_file_cmd
```

- [ ] **Step 6: Run Rust tests and check**

Run:

```bash
rtk cargo test --manifest-path "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/Cargo.toml" text_file
rtk cargo check --manifest-path "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/Cargo.toml"
```

Expected: PASS for added text-file tests and cargo check exits 0.

- [ ] **Step 7: Commit backend commands**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/src/services/pty_service.rs" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/src/commands/pty.rs" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/src/lib.rs"
rtk git commit -m "feat: add text file editor commands"
```

## Task 2: Editor store

**Files:**
- Create: `src/stores/editorStore.ts`
- Create: `src/stores/editorStore.test.ts`

- [ ] **Step 1: Write failing editor store tests**

Create `src/stores/editorStore.test.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './editorStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('editorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    vi.restoreAllMocks();
  });

  it('opens a text file from Tauri and makes it active', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: '<template />' });
    const store = useEditorStore();

    await store.openFile('C:/Project/App.vue');

    expect(invokeMock).toHaveBeenCalledWith('read_text_file_cmd', { path: 'C:/Project/App.vue' });
    expect(store.files).toHaveLength(1);
    expect(store.activeFile?.name).toBe('App.vue');
    expect(store.activeFile?.content).toBe('<template />');
    expect(store.hasOpenFiles).toBe(true);
  });

  it('activates an already opened file without reading it again', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/A.vue', name: 'A.vue', content: 'A' })
      .mockResolvedValueOnce({ path: 'C:/Project/B.vue', name: 'B.vue', content: 'B' });
    const store = useEditorStore();

    await store.openFile('C:/Project/A.vue');
    await store.openFile('C:/Project/B.vue');
    await store.openFile('C:/Project/A.vue');

    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(store.files.map((file) => file.path)).toEqual(['C:/Project/A.vue', 'C:/Project/B.vue']);
    expect(store.activePath).toBe('C:/Project/A.vue');
  });

  it('tracks dirty state and saves the active file', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    invokeMock.mockResolvedValueOnce(undefined);
    const store = useEditorStore();

    await store.openFile('C:/Project/App.vue');
    store.updateActiveContent('new');

    expect(store.activeFile?.dirty).toBe(true);
    await store.saveActiveFile();

    expect(invokeMock).toHaveBeenLastCalledWith('write_text_file_cmd', {
      path: 'C:/Project/App.vue',
      content: 'new',
    });
    expect(store.activeFile?.dirty).toBe(false);
    expect(store.activeFile?.savedContent).toBe('new');
  });

  it('keeps dirty file open when close confirmation is cancelled', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const store = useEditorStore();

    await store.openFile('C:/Project/App.vue');
    store.updateActiveContent('new');
    const closed = store.closeFile('C:/Project/App.vue');

    expect(closed).toBe(false);
    expect(store.files).toHaveLength(1);
  });

  it('closes dirty file when confirmation is accepted and activates neighbor', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/A.vue', name: 'A.vue', content: 'A' })
      .mockResolvedValueOnce({ path: 'C:/Project/B.vue', name: 'B.vue', content: 'B' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const store = useEditorStore();

    await store.openFile('C:/Project/A.vue');
    await store.openFile('C:/Project/B.vue');
    store.setActiveFile('C:/Project/A.vue');
    store.updateActiveContent('changed');
    const closed = store.closeFile('C:/Project/A.vue');

    expect(closed).toBe(true);
    expect(store.files.map((file) => file.path)).toEqual(['C:/Project/B.vue']);
    expect(store.activePath).toBe('C:/Project/B.vue');
  });

  it('stores open errors without adding a file tab', async () => {
    invokeMock.mockRejectedValueOnce('file is not valid UTF-8');
    const store = useEditorStore();

    await store.openFile('C:/Project/binary.bin');

    expect(store.files).toHaveLength(0);
    expect(store.openError).toBe('file is not valid UTF-8');
  });
});
```

- [ ] **Step 2: Run editor store tests and verify they fail**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/stores/editorStore.test.ts
```

Expected: FAIL because `src/stores/editorStore.ts` does not exist.

- [ ] **Step 3: Implement editor store**

Create `src/stores/editorStore.ts`:

```ts
import { invoke } from '@tauri-apps/api/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

interface TextFilePayload {
  path: string;
  name: string;
  content: string;
}

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string;
}

export type EditableFile = EditorFile & { dirty: boolean };

const fileNameFromPath = (path: string) => {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? path;
};

export const useEditorStore = defineStore('editor', () => {
  const files = ref<EditorFile[]>([]);
  const activePath = ref<string | null>(null);
  const openError = ref('');

  const activeFile = computed<EditableFile | null>(() => {
    const file = files.value.find((candidate) => candidate.path === activePath.value) ?? null;
    return file ? { ...file, dirty: file.content !== file.savedContent } : null;
  });

  const hasOpenFiles = computed(() => files.value.length > 0);
  const dirtyFiles = computed(() => files.value.filter((file) => file.content !== file.savedContent));
  const isDirty = (path: string) => {
    const file = files.value.find((candidate) => candidate.path === path);
    return !!file && file.content !== file.savedContent;
  };

  const setActiveFile = (path: string) => {
    if (files.value.some((file) => file.path === path)) {
      activePath.value = path;
    }
  };

  const openFile = async (path: string) => {
    openError.value = '';
    const existing = files.value.find((file) => file.path === path);
    if (existing) {
      activePath.value = existing.path;
      return;
    }

    try {
      const payload = await invoke<TextFilePayload>('read_text_file_cmd', { path });
      files.value.push({
        path: payload.path,
        name: payload.name || fileNameFromPath(payload.path),
        content: payload.content,
        savedContent: payload.content,
        loading: false,
        saving: false,
        error: '',
      });
      activePath.value = payload.path;
    } catch (error) {
      openError.value = String(error);
    }
  };

  const updateActiveContent = (content: string) => {
    const file = files.value.find((candidate) => candidate.path === activePath.value);
    if (!file) return;
    file.content = content;
    file.error = '';
  };

  const saveActiveFile = async () => {
    const file = files.value.find((candidate) => candidate.path === activePath.value);
    if (!file || file.saving) return false;
    file.saving = true;
    file.error = '';
    try {
      await invoke('write_text_file_cmd', { path: file.path, content: file.content });
      file.savedContent = file.content;
      return true;
    } catch (error) {
      file.error = String(error);
      return false;
    } finally {
      file.saving = false;
    }
  };

  const closeFile = (path: string) => {
    const index = files.value.findIndex((file) => file.path === path);
    if (index === -1) return false;
    const file = files.value[index];
    if (file.content !== file.savedContent && !window.confirm(`关闭 ${file.name}？未保存的更改会丢失。`)) {
      return false;
    }

    files.value.splice(index, 1);
    if (activePath.value === path) {
      activePath.value = files.value[index]?.path ?? files.value[index - 1]?.path ?? null;
    }
    return true;
  };

  const closeActiveFile = () => {
    if (!activePath.value) return false;
    return closeFile(activePath.value);
  };

  return {
    files,
    activePath,
    activeFile,
    hasOpenFiles,
    dirtyFiles,
    openError,
    isDirty,
    openFile,
    setActiveFile,
    updateActiveContent,
    saveActiveFile,
    closeFile,
    closeActiveFile,
  };
});
```

- [ ] **Step 4: Run editor store tests**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/stores/editorStore.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit editor store**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/stores/editorStore.ts" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/stores/editorStore.test.ts"
rtk git commit -m "feat: add file editor store"
```

## Task 3: File editor pane

**Files:**
- Create: `src/components/FileEditorPane.vue`
- Create: `src/components/FileEditorPane.test.ts`

- [ ] **Step 1: Write failing FileEditorPane tests**

Create `src/components/FileEditorPane.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileEditorPane from './FileEditorPane.vue';
import { useEditorStore } from '../stores/editorStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('FileEditorPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
  });

  it('renders editor tabs and active file content', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: '<template />' })
      .mockResolvedValueOnce({ path: 'C:/Project/main.ts', name: 'main.ts', content: 'createApp()' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');
    await store.openFile('C:/Project/main.ts');

    const wrapper = mount(FileEditorPane);

    expect(wrapper.text()).toContain('App.vue');
    expect(wrapper.text()).toContain('main.ts');
    expect(wrapper.get('textarea').element.value).toBe('createApp()');
    expect(wrapper.text()).toContain('C:/Project/main.ts');
  });

  it('updates content and shows dirty marker', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('textarea').setValue('new');

    expect(store.activeFile?.content).toBe('new');
    expect(wrapper.text()).toContain('●');
    expect(wrapper.text()).toContain('未保存');
  });

  it('switches active editor tab', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'A' })
      .mockResolvedValueOnce({ path: 'C:/Project/main.ts', name: 'main.ts', content: 'B' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');
    await store.openFile('C:/Project/main.ts');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('button[aria-label="切换到 App.vue"]').trigger('click');

    expect(store.activePath).toBe('C:/Project/App.vue');
    expect(wrapper.get('textarea').element.value).toBe('A');
  });

  it('saves active file from toolbar button', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    invokeMock.mockResolvedValueOnce(undefined);
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('textarea').setValue('new');
    await wrapper.get('button[aria-label="保存当前文件"]').trigger('click');

    expect(invokeMock).toHaveBeenLastCalledWith('write_text_file_cmd', {
      path: 'C:/Project/App.vue',
      content: 'new',
    });
  });

  it('closes file from tab close button', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('button[aria-label="关闭 App.vue"]').trigger('click');

    expect(store.files).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run FileEditorPane tests and verify they fail**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/FileEditorPane.test.ts
```

Expected: FAIL because `FileEditorPane.vue` does not exist.

- [ ] **Step 3: Implement FileEditorPane**

Create `src/components/FileEditorPane.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import { useEditorStore } from '../stores/editorStore';

const editorStore = useEditorStore();

const activeFile = computed(() => editorStore.activeFile);

const updateContent = (event: Event) => {
  editorStore.updateActiveContent((event.target as HTMLTextAreaElement).value);
};
</script>

<template>
  <section class="file-editor-pane" aria-label="文件编辑器">
    <div class="editor-tabs" role="tablist" aria-label="打开的文件">
      <button
        v-for="file in editorStore.files"
        :key="file.path"
        type="button"
        class="editor-tab"
        :class="{ active: file.path === editorStore.activePath }"
        role="tab"
        :aria-selected="file.path === editorStore.activePath"
        :aria-label="`切换到 ${file.name}`"
        @click="editorStore.setActiveFile(file.path)"
      >
        <span class="editor-tab-icon" aria-hidden="true">📄</span>
        <span class="editor-tab-name">{{ file.name }}</span>
        <span v-if="editorStore.isDirty(file.path)" class="editor-dirty" aria-label="未保存">●</span>
        <span v-if="file.saving" class="editor-saving">保存中</span>
        <span v-if="file.error" class="editor-tab-error" aria-label="保存失败">!</span>
        <button
          type="button"
          class="editor-tab-close"
          :aria-label="`关闭 ${file.name}`"
          @click.stop="editorStore.closeFile(file.path)"
        >×</button>
      </button>
    </div>

    <div v-if="activeFile" class="editor-toolbar">
      <span class="editor-path" :title="activeFile.path">{{ activeFile.path }}</span>
      <span class="editor-status">
        <span v-if="activeFile.error" class="editor-error">{{ activeFile.error }}</span>
        <span v-else-if="activeFile.saving">保存中…</span>
        <span v-else-if="activeFile.dirty">未保存</span>
        <span v-else>已保存</span>
      </span>
      <button
        type="button"
        class="editor-save-button"
        aria-label="保存当前文件"
        :disabled="activeFile.saving || !activeFile.dirty"
        @click="editorStore.saveActiveFile()"
      >保存</button>
    </div>

    <textarea
      v-if="activeFile"
      class="editor-textarea"
      spellcheck="false"
      :value="activeFile.content"
      @input="updateContent"
    />

    <div v-else-if="editorStore.openError" class="editor-empty error">
      {{ editorStore.openError }}
    </div>
  </section>
</template>

<style scoped>
.file-editor-pane {
  height: 54%;
  min-height: 260px;
  display: flex;
  flex-direction: column;
  border-bottom: 1px solid var(--ui-border);
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  overflow: hidden;
}

.editor-tabs {
  height: 36px;
  flex: 0 0 36px;
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 0 8px;
  background: var(--ui-bg);
  border-bottom: 1px solid var(--ui-border);
  overflow-x: auto;
  overflow-y: hidden;
}

.editor-tab {
  max-width: 220px;
  height: 32px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 0 8px 0 10px;
  border: 1px solid var(--ui-border);
  border-bottom-color: transparent;
  border-radius: 7px 7px 0 0;
  background: color-mix(in srgb, var(--ui-bg-light) 88%, #000 12%);
  color: var(--ui-fg-muted);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}

.editor-tab.active {
  background: var(--ui-bg-light);
  color: var(--ui-fg);
}

.editor-tab-name {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.editor-dirty {
  color: #f9e2af;
  font-size: 10px;
}

.editor-saving,
.editor-tab-error {
  color: var(--ui-fg-muted);
  font-size: 10px;
}

.editor-tab-error {
  color: #f38ba8;
  font-weight: 700;
}

.editor-tab-close {
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-fg-muted);
  cursor: pointer;
}

.editor-tab-close:hover {
  background: var(--ui-hover);
  color: var(--ui-fg);
}

.editor-toolbar {
  height: 30px;
  flex: 0 0 30px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  border-bottom: 1px solid var(--ui-border);
  color: var(--ui-fg-muted);
  font-size: 11px;
}

.editor-path {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.editor-status {
  flex-shrink: 0;
}

.editor-error {
  color: #f38ba8;
}

.editor-save-button {
  height: 22px;
  padding: 0 8px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  color: var(--ui-fg);
  cursor: pointer;
}

.editor-save-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.editor-textarea {
  flex: 1;
  min-height: 0;
  width: 100%;
  resize: none;
  border: 0;
  outline: none;
  padding: 14px 18px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  font: 13px/1.6 Consolas, "Cascadia Code", monospace;
}

.editor-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  color: var(--ui-fg-muted);
  font-size: 13px;
}

.editor-empty.error {
  color: #f38ba8;
}
</style>
```

- [ ] **Step 4: Run FileEditorPane tests**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/FileEditorPane.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit editor pane**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/FileEditorPane.vue" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/FileEditorPane.test.ts"
rtk git commit -m "feat: add file editor pane"
```

## Task 4: File tree open-file event

**Files:**
- Modify: `src/components/FileTreeNode.vue`
- Create: `src/components/FileTreeNode.test.ts`

- [ ] **Step 1: Write failing FileTreeNode tests**

Create `src/components/FileTreeNode.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileTreeNode from './FileTreeNode.vue';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('FileTreeNode', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    invokeMock.mockReset();
  });

  it('emits open-file when a file name is double clicked', async () => {
    const wrapper = mount(FileTreeNode, {
      attachTo: document.body,
      props: {
        entry: { name: 'App.vue', path: 'C:/Project/App.vue', kind: 'file', extension: 'vue' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-name').trigger('dblclick');

    expect(wrapper.emitted('open-file')).toEqual([['C:/Project/App.vue']]);
    expect(wrapper.find('input.tree-rename-input').exists()).toBe(false);
  });

  it('keeps folder click behavior for loading children', async () => {
    invokeMock.mockResolvedValueOnce([
      { name: 'App.vue', path: 'C:/Project/src/App.vue', kind: 'file', extension: 'vue' },
    ]);
    const wrapper = mount(FileTreeNode, {
      attachTo: document.body,
      props: {
        entry: { name: 'src', path: 'C:/Project/src', kind: 'folder', extension: '' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-row').trigger('click');

    expect(invokeMock).toHaveBeenCalledWith('list_directory', { path: 'C:/Project/src' });
    await vi.waitFor(() => expect(wrapper.text()).toContain('App.vue'));
  });

  it('forwards open-file from recursive child nodes', async () => {
    invokeMock.mockResolvedValueOnce([
      { name: 'App.vue', path: 'C:/Project/src/App.vue', kind: 'file', extension: 'vue' },
    ]);
    const wrapper = mount(FileTreeNode, {
      attachTo: document.body,
      props: {
        entry: { name: 'src', path: 'C:/Project/src', kind: 'folder', extension: '' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-row').trigger('click');
    await vi.waitFor(() => expect(wrapper.text()).toContain('App.vue'));
    await wrapper.findAll('.tree-name')[1].trigger('dblclick');

    expect(wrapper.emitted('open-file')).toEqual([['C:/Project/src/App.vue']]);
  });
});
```

- [ ] **Step 2: Run FileTreeNode tests and verify they fail**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/FileTreeNode.test.ts
```

Expected: FAIL because `open-file` is not emitted and double-click starts rename.

- [ ] **Step 3: Update FileTreeNode emits and handlers**

In `src/components/FileTreeNode.vue`, change `defineEmits` to:

```ts
const emit = defineEmits<{
  refresh: [];
  'open-file': [path: string];
}>();
```

After `toggle`, add:

```ts
const openFile = () => {
  if (renaming.value || props.entry.kind !== 'file') return;
  emit('open-file', props.entry.path);
};
```

Change the filename span from:

```vue
<span v-else class="tree-name" :title="entry.path" @dblclick.stop="startRename">{{ entry.name }}</span>
```

to:

```vue
<span v-else class="tree-name" :title="entry.path" @dblclick.stop="openFile">{{ entry.name }}</span>
```

In the recursive `FileTreeNode`, add open-file forwarding:

```vue
@open-file="emit('open-file', $event)"
```

The recursive node block should become:

```vue
<FileTreeNode
  v-for="child in children"
  :key="child.path"
  :entry="child"
  :depth="depth + 1"
  @refresh="refreshChildren"
  @open-file="emit('open-file', $event)"
/>
```

- [ ] **Step 4: Run FileTreeNode tests**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/FileTreeNode.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit file tree event**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/FileTreeNode.vue" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/FileTreeNode.test.ts"
rtk git commit -m "feat: open files from explorer tree"
```

## Task 5: Sidebar wiring

**Files:**
- Modify: `src/components/SidebarPanel.vue`
- Modify: `src/components/SidebarPanel.test.ts`

- [ ] **Step 1: Update SidebarPanel test stub and add failing test**

In `src/components/SidebarPanel.test.ts`, add this import:

```ts
import { useEditorStore } from '../stores/editorStore';
```

Change the FileTreeNode stub in `mountSidebar` to:

```ts
FileTreeNode: {
  props: ['entry', 'depth'],
  emits: ['refresh', 'open-file'],
  template: '<button class="file-tree-node-stub" @click="$emit(\'open-file\', entry.path)">{{ entry.name }}</button>',
},
```

Add this test before the final `does not render sidebar session...` test:

```ts
it('opens editor file from file tree events', async () => {
  const store = useTerminalStore();
  const editorStore = useEditorStore();
  const openSpy = vi.spyOn(editorStore, 'openFile').mockResolvedValue(undefined);
  store.setCurrentWorkspace('C:/Project');

  const wrapper = mountSidebar();
  await vi.waitFor(() => expect(wrapper.text()).toContain('package.json'));
  await wrapper.findAll('.file-tree-node-stub')[1].trigger('click');

  expect(openSpy).toHaveBeenCalledWith('C:/Project/package.json');
});
```

- [ ] **Step 2: Run SidebarPanel test and verify it fails**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/SidebarPanel.test.ts
```

Expected: FAIL because sidebar does not import or call `editorStore.openFile`.

- [ ] **Step 3: Wire SidebarPanel to editor store**

In `src/components/SidebarPanel.vue`, add import:

```ts
import { useEditorStore } from '../stores/editorStore';
```

After `const store = useTerminalStore();`, add:

```ts
const editorStore = useEditorStore();
```

After `refreshTree`, add:

```ts
const openFile = (path: string) => {
  void editorStore.openFile(path);
};
```

In the root `FileTreeNode` template, add:

```vue
@open-file="openFile"
```

The root node block should become:

```vue
<FileTreeNode
  v-for="entry in rootEntries"
  :key="`${treeRefreshKey}-${entry.path}`"
  :entry="entry"
  :depth="0"
  @refresh="refreshTree"
  @open-file="openFile"
/>
```

- [ ] **Step 4: Run SidebarPanel tests**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/components/SidebarPanel.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit sidebar wiring**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/SidebarPanel.vue" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/components/SidebarPanel.test.ts"
rtk git commit -m "feat: connect explorer files to editor"
```

## Task 6: App layout and Ctrl+S

**Files:**
- Modify: `src/App.vue`
- Create: `src/App.test.ts`

- [ ] **Step 1: Write failing App integration tests**

Create `src/App.test.ts`:

```ts
import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useEditorStore } from './stores/editorStore';

const invokeMock = vi.fn();
const listenMock = vi.fn(() => Promise.resolve(() => undefined));

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    listen: listenMock,
  }),
}));

describe('App file editor layout', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    setActivePinia(createPinia());
    invokeMock.mockReset();
    listenMock.mockClear();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${Math.random()}`) });
  });

  it('hides editor pane when no files are open', () => {
    const wrapper = mount(App, {
      global: {
        stubs: {
          SidebarPanel: true,
          TabBar: true,
          TerminalTab: true,
          SettingsModal: true,
        },
      },
    });

    expect(wrapper.findComponent({ name: 'FileEditorPane' }).exists()).toBe(false);
    expect(wrapper.find('.terminal-workspace').exists()).toBe(true);
    expect(wrapper.find('.terminal-workspace').classes()).not.toContain('compact');
  });

  it('shows editor pane above compact terminal workspace when a file is open', async () => {
    const editorStore = useEditorStore();
    editorStore.files.push({
      path: 'C:/Project/App.vue',
      name: 'App.vue',
      content: 'old',
      savedContent: 'old',
      loading: false,
      saving: false,
      error: '',
    });
    editorStore.activePath = 'C:/Project/App.vue';

    const wrapper = mount(App, {
      global: {
        stubs: {
          SidebarPanel: true,
          FileEditorPane: { template: '<section class="file-editor-pane-stub" />' },
          TabBar: true,
          TerminalTab: true,
          SettingsModal: true,
        },
      },
    });

    expect(wrapper.find('.file-editor-pane-stub').exists()).toBe(true);
    expect(wrapper.find('.terminal-workspace').classes()).toContain('compact');
  });

  it('saves active editor file on Ctrl+S', async () => {
    const editorStore = useEditorStore();
    editorStore.files.push({
      path: 'C:/Project/App.vue',
      name: 'App.vue',
      content: 'new',
      savedContent: 'old',
      loading: false,
      saving: false,
      error: '',
    });
    editorStore.activePath = 'C:/Project/App.vue';
    const saveSpy = vi.spyOn(editorStore, 'saveActiveFile').mockResolvedValue(true);

    mount(App, {
      global: {
        stubs: {
          SidebarPanel: true,
          FileEditorPane: true,
          TabBar: true,
          TerminalTab: true,
          SettingsModal: true,
        },
      },
    });
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true });
    const preventDefault = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefault).toHaveBeenCalled();
    expect(saveSpy).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run App test and verify it fails**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/App.test.ts
```

Expected: FAIL because `FileEditorPane` is not imported/rendered and `.terminal-workspace` does not exist.

- [ ] **Step 3: Update App imports and store setup**

In `src/App.vue`, add imports:

```ts
import FileEditorPane from './components/FileEditorPane.vue';
import { useEditorStore } from './stores/editorStore';
```

After `const store = useTerminalStore();`, add:

```ts
const editorStore = useEditorStore();
```

- [ ] **Step 4: Add Ctrl+S handling before generic Ctrl handling**

In `handleKeydown`, immediately before `if (!e.ctrlKey) return;`, add:

```ts
  if ((e.key === 's' || e.key === 'S') && editorStore.activeFile) {
    e.preventDefault();
    void editorStore.saveActiveFile();
    return;
  }
```

- [ ] **Step 5: Update App template layout**

Replace the current content layout block:

```vue
<div class="content-layout">
  <TabBar />
  <div class="terminal-wrapper">
    <div v-if="store.tabs.length === 0" class="terminal-empty-state">
      <div class="terminal-empty-card">
        <div class="terminal-empty-title">暂无 Session</div>
        <div class="terminal-empty-copy">从左侧边栏创建新的 PowerShell session 开始使用。</div>
      </div>
    </div>
    <TerminalTab
      v-for="tab in store.tabs"
      :key="tab.id"
      :tab-id="tab.id"
      :active="tab.id === store.activeTabId"
    />
  </div>
</div>
```

with:

```vue
<div class="content-layout">
  <FileEditorPane v-if="editorStore.hasOpenFiles" />
  <div class="terminal-workspace" :class="{ compact: editorStore.hasOpenFiles }">
    <TabBar />
    <div class="terminal-wrapper">
      <div v-if="store.tabs.length === 0" class="terminal-empty-state">
        <div class="terminal-empty-card">
          <div class="terminal-empty-title">暂无 Session</div>
          <div class="terminal-empty-copy">从顶部标签栏新建 PowerShell、CMD 或 WSL2 终端。</div>
        </div>
      </div>
      <TerminalTab
        v-for="tab in store.tabs"
        :key="tab.id"
        :tab-id="tab.id"
        :active="tab.id === store.activeTabId"
      />
    </div>
  </div>
</div>
```

- [ ] **Step 6: Add terminal workspace CSS**

In `src/App.vue` style, replace:

```css
.terminal-wrapper { flex: 1; overflow: hidden; position: relative; }
```

with:

```css
.terminal-workspace {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--ui-bg);
}

.terminal-workspace.compact {
  min-height: 220px;
}

.terminal-wrapper {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
```

Also ensure `.content-layout` includes `min-height: 0`; if missing, change it to:

```css
.content-layout {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
```

- [ ] **Step 7: Run App tests**

Run:

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run src/App.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit App layout**

```bash
rtk git add "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/App.vue" "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src/App.test.ts"
rtk git commit -m "feat: place file editor above terminal"
```

## Task 7: Full verification and manual QA

**Files:**
- Verify all changed files.
- No planned source changes unless tests expose a concrete failure.

- [ ] **Step 1: Run full frontend tests**

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" test:run
```

Expected: all Vitest tests pass.

- [ ] **Step 2: Run frontend build**

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" build
```

Expected: build succeeds. A Vite chunk-size warning is acceptable if it matches the existing warning.

- [ ] **Step 3: Run Rust check**

```bash
rtk cargo check --manifest-path "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel/src-tauri/Cargo.toml"
```

Expected: cargo check exits 0.

- [ ] **Step 4: Start LumiTerm for manual QA**

```bash
rtk proxy npx pnpm --dir "E:/claudecode/lumi-term/.worktrees/feat-sidebar-panel" tauri dev
```

Expected: LumiTerm launches.

- [ ] **Step 5: Manual QA checklist**

In the running app:

1. Select a workspace from the left workspace selector.
2. Confirm the left file tree displays folders and files.
3. Expand a folder.
4. Double-click a UTF-8 text file.
5. Confirm an editor pane opens above the terminal.
6. Confirm the existing terminal tab bar and xterm pane move below the editor.
7. Type in the textarea and confirm dirty marker `●` appears.
8. Press Ctrl+S and confirm dirty marker clears.
9. Open a second file and switch editor tabs.
10. Close a clean editor tab and confirm no prompt appears.
11. Edit a file, click close, cancel the confirm, and confirm the tab remains open.
12. Click close again, accept the confirm, and confirm the tab closes.
13. Use the top terminal tab bar to create a new terminal.
14. Type in the terminal and confirm PTY input/output still works.
15. Use terminal split controls if present and confirm split panes still render.

- [ ] **Step 6: Commit verification fixes if needed**

If verification required fixes, commit only those changed files:

```bash
rtk git add <exact-fixed-files>
rtk git commit -m "fix: stabilize file editor integration"
```

If no fixes were needed, do not create an empty commit.

## Self-Review Checklist

- Spec coverage:
  - Backend read/write commands: Task 1.
  - Dedicated editor store: Task 2.
  - Editor pane UI: Task 3.
  - FileTreeNode double-click open and rename removal from double-click: Task 4.
  - Sidebar event wiring: Task 5.
  - App upper editor/lower terminal layout and Ctrl+S: Task 6.
  - Full tests/build/Rust/manual QA: Task 7.
- Placeholder scan: no `TBD`, `TODO`, `fill in`, or vague implementation-only steps.
- Type consistency:
  - Backend command names are `read_text_file_cmd` and `write_text_file_cmd` everywhere.
  - Frontend store is `useEditorStore` everywhere.
  - `EditorFile` fields match the spec: `path`, `name`, `content`, `savedContent`, `loading`, `saving`, `error`.
  - File tree event is consistently named `open-file`.
