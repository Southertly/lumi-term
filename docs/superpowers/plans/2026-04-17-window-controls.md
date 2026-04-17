# Window Controls Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add minimize and maximize/restore window control buttons to the custom titlebar.

**Architecture:** Expose Tauri window control commands in Rust backend, add three buttons (minimize, maximize/restore, close) to the titlebar in Vue frontend with state tracking for maximize status.

**Tech Stack:** Tauri 2.x window API, Vue 3 Composition API, Tauri event system

---

## File Structure

**Backend:**
- Modify: `src-tauri/src/commands/pty.rs` - Add window control commands
- Modify: `src-tauri/src/lib.rs` - Register new commands

**Frontend:**
- Modify: `src/App.vue` - Add window control buttons and state management

---

### Task 1: Add Backend Window Control Commands

**Files:**
- Modify: `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Add minimize_window command**

Add to `src-tauri/src/commands/pty.rs` after the `close_app` function:

```rust
/// Minimizes the application window to the taskbar.
#[tauri::command]
pub fn minimize_window(window: tauri::Window) {
    window.minimize().unwrap();
}
```

- [ ] **Step 2: Add toggle_maximize command**

Add to `src-tauri/src/commands/pty.rs` after `minimize_window`:

```rust
/// Toggles between maximized and normal window state.
#[tauri::command]
pub fn toggle_maximize(window: tauri::Window) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}
```

- [ ] **Step 3: Export new commands in lib.rs**

In `src-tauri/src/lib.rs`, update the import statement:

```rust
use commands::pty::{close_app, close_pty_cmd, create_pty, init_pty_store, minimize_window, resize_pty_cmd, toggle_maximize, write_pty_cmd};
```

- [ ] **Step 4: Register commands in invoke_handler**

In `src-tauri/src/lib.rs`, update the `invoke_handler` call:

```rust
.invoke_handler(tauri::generate_handler![
    create_pty,
    write_pty_cmd,
    resize_pty_cmd,
    close_pty_cmd,
    close_app,
    minimize_window,
    toggle_maximize
])
```

- [ ] **Step 5: Test compilation**

Run: `cd src-tauri && cargo check`
Expected: No errors

- [ ] **Step 6: Commit backend changes**

```bash
git add src-tauri/src/commands/pty.rs src-tauri/src/lib.rs
git commit -m "feat: add window control commands (minimize, toggle_maximize)"
```

---

### Task 2: Add Frontend Window Control Buttons

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 1: Add isMaximized state and window event listener**

In `src/App.vue` `<script setup>` section, add after the `closeApp` function:

```typescript
const isMaximized = ref(false);

async function minimizeWindow() {
  invoke('minimize_window').catch((err) => console.error('[App] minimize_window failed:', err));
}

async function toggleMaximize() {
  invoke('toggle_maximize').catch((err) => console.error('[App] toggle_maximize failed:', err));
}

async function updateMaximizedState() {
  const { appWindow } = await import('@tauri-apps/api/window');
  isMaximized.value = await appWindow.isMaximized();
}
```

- [ ] **Step 2: Add window resize event listener**

In `src/App.vue`, update the `onMounted` hook to include window event listener:

```typescript
onMounted(async () => {
  store.createTab('powershell');
  window.addEventListener('keydown', handleKeydown);
  
  const { appWindow } = await import('@tauri-apps/api/window');
  await updateMaximizedState();
  appWindow.listen('tauri://resize', updateMaximizedState);
});
```

- [ ] **Step 3: Add window control buttons to titlebar**

In `src/App.vue` `<template>` section, replace the titlebar div:

```vue
<div class="titlebar" data-tauri-drag-region>
  <div class="titlebar-title">LumiTerm</div>
  <div class="window-controls">
    <button class="control-btn minimize-btn" @click="minimizeWindow">—</button>
    <button class="control-btn maximize-btn" @click="toggleMaximize">
      {{ isMaximized ? '❐' : '⬜' }}
    </button>
    <button class="control-btn close-btn" @click="closeApp">✕</button>
  </div>
</div>
```

- [ ] **Step 4: Update titlebar styles**

In `src/App.vue` `<style>` section, replace the `.titlebar` and `.close-btn` styles:

```css
.titlebar {
  height: 32px; background: #181825;
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 12px; user-select: none;
}
.titlebar-title { font-size: 13px; color: #cdd6f4; font-weight: 500; }
.window-controls {
  display: flex;
  align-items: center;
  gap: 0;
}
.control-btn {
  width: 32px; height: 24px;
  background: transparent;
  border: none;
  color: #cdd6f4;
  font-size: 14px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.15s ease;
}
.control-btn:hover {
  background: #313244;
}
.close-btn:hover {
  background: #f38ba8;
  color: #11111b;
}
```

- [ ] **Step 5: Test in development mode**

Run: `npx pnpm tauri dev`
Expected: Window opens with three control buttons in titlebar

- [ ] **Step 6: Manual testing**

Test each button:
- Click minimize button → window minimizes to taskbar
- Click maximize button → window maximizes, button icon changes to ❐
- Click maximize button again → window restores, button icon changes to ⬜
- Click close button → application exits

- [ ] **Step 7: Commit frontend changes**

```bash
git add src/App.vue
git commit -m "feat: add window control buttons to titlebar"
```

---

### Task 3: Clean Up Debug Logs

**Files:**
- Modify: `src/components/TabBar.vue`

- [ ] **Step 1: Remove debug console.log statements**

In `src/components/TabBar.vue`, remove the `toggleDropdown` function and restore inline handler:

Replace:
```typescript
function toggleDropdown() {
  console.log('[TabBar] toggleDropdown, current:', dropdownOpen.value);
  dropdownOpen.value = !dropdownOpen.value;
  console.log('[TabBar] toggleDropdown, new:', dropdownOpen.value);
}
```

With:
```typescript
// (remove the function entirely)
```

- [ ] **Step 2: Update template to use inline handler**

In `src/components/TabBar.vue` template, change:

```vue
@click.stop="toggleDropdown"
```

To:
```vue
@click.stop="dropdownOpen = !dropdownOpen"
```

- [ ] **Step 3: Remove debug log from openTab**

In `src/components/TabBar.vue`, update `openTab` function:

```typescript
function openTab(shellType: ShellType) {
  store.createTab(shellType);
  dropdownOpen.value = false;
}
```

- [ ] **Step 4: Commit cleanup**

```bash
git add src/components/TabBar.vue
git commit -m "chore: remove debug logs from TabBar"
```

---

## Testing Checklist

After all tasks complete:

- [ ] Minimize button minimizes window to taskbar
- [ ] Maximize button maximizes window to full screen
- [ ] Maximize button icon changes to ❐ when maximized
- [ ] Clicking maximized button restores window
- [ ] Restored button icon changes back to ⬜
- [ ] Close button exits application
- [ ] All buttons show correct hover effects
- [ ] Existing terminal functionality unaffected
