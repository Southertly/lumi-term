# LumiTerm File Editor Design

## Goal

Implement the first text-file editing experience inside LumiTerm without replacing the existing terminal workflow.

Users can double-click a file in the left file tree, open it in a tabbed editor in the upper half of the main area, edit text in a textarea, save with Ctrl+S, see dirty state, and confirm before closing unsaved changes. The terminal remains in the same main area and moves to the lower half while editor tabs are open.

## Scope

### In scope

- Double-click a file in the Explorer tree to open it in an editor tab.
- Keep folder expand/collapse behavior in the file tree.
- Move rename to the existing right-click menu only. Double-click no longer starts rename.
- Add an upper editor pane that appears only when files are open.
- Keep the existing terminal tab bar, terminal rendering, split panes, xterm setup, and PTY lifecycle intact.
- Use a plain textarea for the first version.
- Support multiple open editor tabs.
- Track dirty state per open file.
- Save the active file with Ctrl+S.
- Confirm before closing a dirty editor tab.
- Add safe text-file read/write commands on the Rust side.

### Out of scope

- Monaco editor.
- Syntax highlighting.
- Binary file editing.
- Large-file streaming.
- Multi-cursor editing.
- Search/replace inside editor.
- Git diff or conflict UI.
- Autosave.
- Dragging editor tabs.
- Resizable editor/terminal split in the first version.

## User Experience

### Default state

When no file is open, the right main area behaves like the current app: terminal tabs stay at the top of the terminal workspace and terminal content fills the available area.

### Opening a file

When the user double-clicks a file in the left tree:

1. LumiTerm reads the file through Tauri.
2. The editor pane appears above the terminal pane.
3. The opened file becomes the active editor tab.
4. The terminal pane moves down and keeps its current tabs, active session, split state, and PTY processes.

If the file is already open, LumiTerm only activates the existing editor tab and does not read the file again.

### Editing

The editor pane contains:

- editor tab strip,
- active file path/status toolbar,
- textarea for file content.

Typing in the textarea updates the active editor tab content. A file is dirty when its current content differs from the last saved content loaded or written by the app.

### Saving

Ctrl+S saves the active editor file when an editor file is active. Saving writes the current content through Tauri. On success, the dirty marker clears and the saved content baseline updates.

If no editor file is active, Ctrl+S should not interfere with normal terminal input behavior.

### Closing tabs

Closing a clean editor tab closes it immediately.

Closing a dirty editor tab shows a native `window.confirm` prompt. If the user confirms, the tab closes and unsaved edits are discarded. If the user cancels, the tab remains open.

### Errors

If a file cannot be opened, the editor should show a small error state and not create a dirty editable tab.

Expected open failures:

- path does not exist,
- path is a directory,
- file is too large,
- file is not valid UTF-8,
- OS read permission error.

Expected save failures:

- path no longer exists,
- path is no longer a file,
- OS write permission error.

Errors should be visible in the editor toolbar or editor body. They should not crash the terminal or sidebar.

## Layout

`App.vue` keeps the current titlebar and main layout. The right content area changes from terminal-only to an editor/terminal stack.

Conceptual structure:

```vue
<div class="content-layout">
  <FileEditorPane v-if="editorStore.hasOpenFiles" />
  <div class="terminal-workspace" :class="{ compact: editorStore.hasOpenFiles }">
    <TabBar />
    <div class="terminal-wrapper">
      <TerminalTab ... />
    </div>
  </div>
</div>
```

CSS behavior:

- `content-layout` is a vertical flex column.
- `FileEditorPane` gets about 54% height with a minimum height around 260px.
- terminal workspace gets the remaining height.
- when no file is open, terminal workspace uses full height.
- all panes use `min-height: 0` and `overflow: hidden` to avoid the previous flex overflow bug.

## Frontend Architecture

### `src/stores/editorStore.ts`

Add a dedicated Pinia store for editor state. This avoids mixing file editing concerns into `terminalStore.ts`.

Core types:

```ts
export interface EditorFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string;
}
```

Core state:

- `files: EditorFile[]`
- `activePath: string | null`

Core getters:

- `activeFile`
- `hasOpenFiles`
- `dirtyFiles`
- `isDirty(path)`

Core actions:

- `openFile(path: string)`
- `setActiveFile(path: string)`
- `updateActiveContent(content: string)`
- `saveActiveFile()`
- `closeFile(path: string)`
- `closeActiveFile()`

`openFile` calls `read_text_file_cmd`. `saveActiveFile` calls `write_text_file_cmd`.

### `src/components/FileEditorPane.vue`

New component responsible only for editor UI.

Responsibilities:

- render editor tabs,
- render dirty marker,
- close tabs,
- show active path and save state,
- render textarea,
- call store actions on input/save/close.

It should not know about terminal tabs or sidebar internals.

### `src/components/FileTreeNode.vue`

Change tree interaction:

- file double-click emits `open-file` with the file path,
- folder click/double-click keeps expand/collapse behavior,
- rename remains available through context menu.

Recursive child nodes must forward `open-file` upward so `SidebarPanel.vue` can handle file opens from any depth.

### `src/components/SidebarPanel.vue`

Handle the `open-file` event from `FileTreeNode` and call `editorStore.openFile(path)`.

The sidebar remains focused on workspace selection, file tree display, and right-click file/folder actions.

### `src/App.vue`

Integrate `FileEditorPane` above the existing terminal area.

Update Ctrl+S handling so it saves the active editor file when editor files are open. Preserve current terminal behavior and avoid sending Ctrl+S into xterm when it is meant to save a file.

Update stale empty-state copy that currently points users to create sessions from the sidebar. Terminal creation now stays in the top terminal tab bar.

## Backend Architecture

Add safe text file commands in the Rust command layer.

### Commands

In `src-tauri/src/commands/pty.rs`:

```rust
#[tauri::command]
pub fn read_text_file_cmd(path: String) -> Result<TextFilePayload, String>

#[tauri::command]
pub fn write_text_file_cmd(path: String, content: String) -> Result<(), String>
```

Register both in `src-tauri/src/lib.rs`.

### Payload

```rust
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct TextFilePayload {
    pub path: String,
    pub name: String,
    pub content: String,
}
```

### Validation

Add file-specific validation instead of reusing `validate_workspace_directory`, because editor paths are files, not folders.

Read validation:

- trim path and reject empty path,
- canonicalize path,
- reject missing path,
- reject directory,
- reject files larger than 1 MiB,
- read bytes,
- decode as UTF-8,
- return a clear error for invalid UTF-8.

Write validation:

- trim path and reject empty path,
- canonicalize path,
- reject missing path,
- reject directory,
- reject content larger than 1 MiB when encoded as UTF-8,
- write content as UTF-8.

The first version does not restrict editing to the active workspace. The existing file tree only passes paths discovered through workspace browsing, and direct command access remains local Tauri app behavior. If later we add path input or external file open, workspace-bound validation can be added then.

## File Operation Semantics

- Opening an already-open file activates the existing tab and preserves unsaved edits.
- Saving a file updates `savedContent` to match `content` only after the Tauri write succeeds.
- Closing a dirty tab discards only after user confirmation.
- If the active tab closes, activate the nearest remaining tab.
- If the last tab closes, hide the editor pane and let the terminal reclaim the main area.

## Testing Plan

### Frontend unit tests

Add tests for `editorStore.ts`:

- opens a file using `read_text_file_cmd`,
- opening the same file twice activates existing tab without duplicate,
- updates content and reports dirty state,
- saves active file using `write_text_file_cmd`,
- save success clears dirty state,
- closing dirty file asks for confirmation,
- canceling confirmation keeps the file open.

Add tests for `FileTreeNode.vue`:

- double-clicking a file emits `open-file`,
- double-clicking a file does not start rename,
- folder interaction still loads children through `list_directory`,
- child node `open-file` events bubble upward.

Add tests for `FileEditorPane.vue`:

- renders open tabs,
- shows dirty marker,
- switches active tab,
- textarea edits update store content,
- close button calls close action,
- Ctrl+S path is covered through App/store integration.

Update `SidebarPanel.test.ts`:

- file open events from tree call `editorStore.openFile`,
- existing tests for file tab, workspace selector, empty tree, and no sessions stay green.

### Rust tests

Add unit tests around text file helpers:

- reads a UTF-8 file,
- rejects directories,
- rejects missing files,
- rejects files larger than 1 MiB,
- rejects invalid UTF-8,
- writes UTF-8 text to an existing file,
- rejects writing content larger than 1 MiB.

### Manual QA

Run the app and verify:

1. select a workspace,
2. expand folders in the left file tree,
3. double-click a text file,
4. confirm editor opens above terminal,
5. type text and see dirty marker,
6. press Ctrl+S and see dirty marker clear,
7. open a second file and switch tabs,
8. close a clean tab,
9. edit a file and close it, then confirm cancel/confirm behavior,
10. verify terminal tabs, shell input, and split panes still work below the editor.

## Implementation Order

1. Add backend text file read/write helpers and Tauri commands.
2. Add `editorStore.ts` with tests.
3. Add `FileEditorPane.vue` with tests.
4. Change `FileTreeNode.vue` to emit file open events and update tests.
5. Wire `SidebarPanel.vue` to `editorStore.openFile`.
6. Update `App.vue` layout and Ctrl+S behavior.
7. Run full frontend tests, build, Rust check, and manual Tauri QA.

## Acceptance Criteria

- Double-clicking a text file opens it in the upper editor pane.
- Terminal moves below the editor and keeps current terminal functionality.
- Multiple editor tabs work.
- Dirty marker appears after editing and clears after save.
- Ctrl+S saves the active editor file.
- Closing a dirty tab asks for confirmation.
- Unsupported files show a clear error and do not break the app.
- Existing sidebar file tree behavior still works.
- Existing terminal tab creation from the top bar still works.
- Test suite and build pass.
