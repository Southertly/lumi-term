# LumiTerm Sidebar Polish Design

**Date:** 2026-04-28  
**Status:** Confirmed for implementation  
**Branch:** `feat/sidebar-panel`

## Goal

Polish the first-pass Warp-style sidebar so it feels like a native desktop terminal navigation rail: cleaner collapse control, correct default session visibility, non-destructive all-session closing, and a workspace picker that supports both typing and browsing Windows drives/folders.

## Scope

Included:
- Replace the current edge-mounted collapse tab with a top sidebar button using the selected Panel Toggle SVG icon.
- Ensure the default PowerShell tab/session appears in the sidebar session list.
- Keep the app open when all sessions are closed from TabBar/Sidebar shortcuts; only the window close control exits the app.
- Add an empty session state with a clear new-session action.
- Upgrade workspace selection to a combined manual-input and folder-browser picker.
- Browser shows Windows drives first, then folders only; typed input filters the visible candidates.

Not included:
- No removal of the top TabBar.
- No file selection, only drives and directories.
- No full command palette or Warp Blocks behavior.

## UI Design

### Collapse button

Use the selected **Panel Toggle** line icon:
- 44×44 interactive area.
- Rounded square surface, themed with existing `--ui-*` tokens.
- Consistent SVG stroke, no emoji icon.
- Located in the top area of the sidebar, above the workspace selector.
- In expanded state, arrow points toward collapse direction; in collapsed state, arrow flips toward expand direction.
- Hover/focus/pressed states use color, border, and subtle elevation only; no layout shift.

### Sidebar empty state

When there are no sessions:
- Sidebar remains visible.
- App window remains open.
- Session list shows an empty state such as “暂无 Session”.
- Provide a visible “New PowerShell” action.
- The terminal/content area can stay empty or show a neutral placeholder; it should not trigger app exit.

## Behavior Design

### Default PowerShell session

On startup without persisted tabs:
- `restoreTabs()` creates the default PowerShell tab.
- That tab receives the current workspace cwd if available.
- If no workspace has been chosen yet, the tab is still included in `tabsForCurrentWorkspace` so it appears in the sidebar list.

Existing old persisted sessions without `cwd` should remain visible rather than disappearing from the sidebar.

### Closing sessions

Closing a session from Sidebar, TabBar, or keyboard shortcuts:
- Removes that tab/session and lets existing `TerminalPane` unmount cleanup close the PTY.
- Does not call `close_app` when the last session is removed.
- Leaves `activeTabId` as `null` if no tabs remain.
- Preserves `currentWorkspacePath` so the next session can still start in the selected workspace.

Only the titlebar/window close button calls `close_app` and exits the application.

## Workspace Picker Design

### Interaction model

The workspace menu becomes a small folder picker:
1. Opening the workspace menu shows an input field and a candidate list.
2. With no input/path selected, candidate list shows available Windows drives, e.g. `C:`, `D:`, `E:`.
3. Clicking a drive changes the browsed path to that drive root and lists its folders.
4. Clicking a folder enters that folder and lists child folders.
5. Typing in the input filters visible candidates while still allowing direct manual path entry.
6. Clicking “切换” validates the input/current browsed path and sets the workspace only if valid.

### Candidate rules

- Show drives and directories only.
- Do not show ordinary files.
- Keep folder rows keyboard/click accessible.
- Show validation errors near the input.
- Do not persist invalid paths.

## Backend/API Design

Add Tauri commands for directory browsing:

```rust
list_workspace_roots() -> Result<Vec<WorkspaceEntry>, String>
list_workspace_children(path: String) -> Result<Vec<WorkspaceEntry>, String>
validate_workspace_path(path: String) -> Result<String, String>
```

`WorkspaceEntry` should include:

```rust
{
  name: String,
  path: String,
  kind: "drive" | "folder"
}
```

The backend validates that paths are directories before listing children. Directory listing should tolerate inaccessible child folders by skipping entries it cannot inspect.

## Frontend Component Boundaries

`SidebarPanel.vue` remains the owner of sidebar UI:
- Collapse button rendering.
- Empty state rendering.
- Workspace menu state: input value, browsed path, entries, loading/error states.
- Calls store methods only after path validation succeeds.

`terminalStore.ts` owns session/workspace state:
- Workspace path normalization.
- `tabsForCurrentWorkspace` should include tabs without `cwd` when appropriate so default/legacy sessions are visible.
- Closing the last tab should not exit the app.

`App.vue` owns app/window-level exit behavior:
- The titlebar close button remains the only app-exit control.
- Keyboard close-tab behavior should remove sessions but not exit the app.

## Error Handling

- If listing drives/folders fails, show an inline error and keep current workspace unchanged.
- If a folder cannot be read, skip it rather than failing the whole list when possible.
- If the user submits an invalid manual path, show the backend validation message and do not update store/recent paths.
- If no drives or folders are available, show an empty candidate message.

## Verification Plan

Manual verification:
1. Launch app and confirm the sidebar collapse button uses the Panel Toggle icon at the top.
2. Toggle collapse/expand and confirm terminal output is preserved.
3. Launch fresh state and confirm default PowerShell appears in the left session list.
4. Close all sessions from sidebar/top tabs/shortcuts and confirm the app remains open.
5. Click titlebar close and confirm the app exits.
6. Open workspace picker and confirm drives appear.
7. Select a drive, then folders, and confirm only folders are shown.
8. Type into the input and confirm candidates filter.
9. Submit a valid path and confirm workspace changes.
10. Submit an invalid path and confirm error is shown without persistence.
11. Create a new session after workspace selection and confirm it starts in that directory.

Automatic verification:
- Frontend build/type check.
- Rust check.
- Rust tests for path canonicalization and directory listing helpers.

## Self-review

- Placeholder scan: no TODO/TBD placeholders remain.
- Scope check: focused on sidebar polish only; no top TabBar removal or command palette work included.
- Consistency check: app exit is only titlebar close; session closing never exits the app.
- Ambiguity check: path browser shows drives/folders only and manual input is validated before persistence.
