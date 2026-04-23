# Inline History List Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the detached bottom InputBar and Ctrl+R popup with an absolute-positioned InputBar that overlays the xterm bottom, with a history list that auto-appears on focus and filters in real-time as the user types.

**Architecture:** `TerminalPane.vue` switches from flex-column to position:relative, and `terminal-container` fills the full pane with `position:absolute;inset:0`. `InputBar.vue` repositions itself with `position:absolute;bottom:0` and gains an inline history list rendered below the input row. xterm row count is kept correct by setting `padding-bottom` on the `.xterm` element equal to InputBar height before every `fitAddon.fit()` call.

**Tech Stack:** Vue 3 Composition API, Pinia (`historyStore`), xterm.js FitAddon, ResizeObserver

---

## File Map

| File | Action |
|------|--------|
| `src/components/InputBar.vue` | Rewrite — absolute overlay, inline history list |
| `src/components/TerminalPane.vue` | Modify — absolute layout, xterm padding, remove HistorySearch |
| `src/App.vue` | Modify — remove `history-search` shortcut dispatch |
| `src/components/HistorySearch.vue` | Delete |

---

## Task 1: Remove HistorySearch.vue and clean App.vue

**Files:**
- Delete: `src/components/HistorySearch.vue`
- Modify: `src/App.vue:113-117`

- [ ] **Step 1: Delete HistorySearch.vue**

```bash
rm src/components/HistorySearch.vue
```

- [ ] **Step 2: Remove history-search shortcut from App.vue**

In `src/App.vue`, find and remove this block (lines 113–117):

```typescript
  if (shortcutsStore.matchesEvent('history-search', e)) {
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:history-search'));
    return;
  }
```

The surrounding context (before removal):

```typescript
  if (shortcutsStore.matchesEvent('cut', e)) {
    if ((document.activeElement as HTMLElement)?.classList.contains('xterm-helper-textarea')) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:cut'));
    return;
  }
  if (shortcutsStore.matchesEvent('history-search', e)) {   // ← remove this block
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:history-search'));
    return;
  }

  // F2: rename active tab
```

After removal it becomes:

```typescript
  if (shortcutsStore.matchesEvent('cut', e)) {
    if ((document.activeElement as HTMLElement)?.classList.contains('xterm-helper-textarea')) return;
    e.preventDefault();
    window.dispatchEvent(new CustomEvent('lumiterm:cut'));
    return;
  }

  // F2: rename active tab
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: delete HistorySearch.vue, remove history-search shortcut from App.vue"
```

---

## Task 2: Rewrite InputBar.vue

**Files:**
- Modify: `src/components/InputBar.vue` (full rewrite)

- [ ] **Step 1: Replace the entire `<script setup>` section**

Replace everything between `<script setup lang="ts">` and `</script>` with:

```typescript
import { ref, computed, watch, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useHistoryStore } from '../stores/historyStore';

const props = defineProps<{
  sessionId: string | null;
  isInteractive: boolean;
  cwd: string;
  gitBranch: string;
}>();

const historyStore = useHistoryStore();
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// ── Inline history list state ──
const showHistory = ref(false);
const selectedHistoryIndex = ref(-1);
let blurTimer: ReturnType<typeof setTimeout> | null = null;

const historyList = computed(() => {
  const q = inputValue.value.trim();
  if (!q) return historyStore.list().slice(0, 10);
  return historyStore.search(q).slice(0, 10);
});

// Reset selection whenever the filtered list changes
watch(historyList, () => {
  selectedHistoryIndex.value = -1;
});

// When interactive mode ends, focus the input bar
watch(() => props.isInteractive, (interactive) => {
  if (!interactive) {
    nextTick(() => inputRef.value?.focus());
  }
});

function displayCwd(cwd: string): string {
  if (!cwd) return '';
  const home = cwd.match(/^[A-Z]:\\Users\\[^\\]+/i)?.[0] ?? '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length).replace(/\\/g, '/');
  }
  return cwd.replace(/\\/g, '/');
}

function handleFocus() {
  if (blurTimer !== null) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  showHistory.value = true;
  selectedHistoryIndex.value = -1;
}

function handleBlur() {
  blurTimer = setTimeout(() => {
    showHistory.value = false;
    blurTimer = null;
  }, 150);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedHistoryIndex.value >= 0 && historyList.value[selectedHistoryIndex.value]) {
      inputValue.value = historyList.value[selectedHistoryIndex.value].command;
      selectedHistoryIndex.value = -1;
      showHistory.value = false;
    }
    sendCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!showHistory.value) {
      showHistory.value = true;
      selectedHistoryIndex.value = 0;
    } else if (historyList.value.length > 0) {
      selectedHistoryIndex.value = Math.max(0,
        selectedHistoryIndex.value <= 0 ? 0 : selectedHistoryIndex.value - 1
      );
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (showHistory.value && historyList.value.length > 0) {
      const next = selectedHistoryIndex.value + 1;
      selectedHistoryIndex.value = next >= historyList.value.length ? -1 : next;
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (showHistory.value && selectedHistoryIndex.value >= 0 && historyList.value[selectedHistoryIndex.value]) {
      inputValue.value = historyList.value[selectedHistoryIndex.value].command;
      selectedHistoryIndex.value = -1;
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    showHistory.value = false;
    selectedHistoryIndex.value = -1;
  }
}

function selectHistoryItem(command: string) {
  // Called by mousedown on a history item
  showHistory.value = false;
  inputValue.value = command;
  selectedHistoryIndex.value = -1;
  nextTick(() => inputRef.value?.focus());
  sendCommand();
}

function sendCommand() {
  const cmd = inputValue.value;
  if (!cmd.trim() || !props.sessionId) return;

  invoke('write_pty_cmd', {
    sessionId: props.sessionId,
    data: Array.from(new TextEncoder().encode(cmd + '\r')),
  }).catch(() => {});

  historyStore.add(cmd);
  inputValue.value = '';
  selectedHistoryIndex.value = -1;
  showHistory.value = false;
}

function fillCommand(command: string) {
  inputValue.value = command;
  selectedHistoryIndex.value = -1;
  nextTick(() => inputRef.value?.focus());
}

defineExpose({ fillCommand, focus: () => inputRef.value?.focus() });
```

- [ ] **Step 2: Replace the `<template>` section**

Replace the entire `<template>` block with:

```html
<template>
  <div
    class="input-bar"
    :class="{ hidden: isInteractive }"
  >
    <div class="input-context">
      <span v-if="cwd" class="input-cwd">{{ displayCwd(cwd) }}</span>
      <span v-if="gitBranch" class="input-separator">|</span>
      <span v-if="gitBranch" class="input-branch"> {{ gitBranch }}</span>
    </div>
    <div class="input-row">
      <span class="input-prompt">❯</span>
      <input
        ref="inputRef"
        v-model="inputValue"
        class="input-field"
        type="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="!sessionId"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      />
    </div>
    <div v-if="showHistory && historyList.length > 0" class="history-list">
      <div class="history-header">历史 {{ historyList.length }} 条 · 输入过滤</div>
      <div
        v-for="(entry, idx) in historyList"
        :key="entry.command"
        class="history-item"
        :class="{ selected: idx === selectedHistoryIndex }"
        @mousedown.prevent="selectHistoryItem(entry.command)"
        @mouseover="selectedHistoryIndex = idx"
      >
        <span class="history-prompt">❯</span>
        <span class="history-command">{{ entry.command }}</span>
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 3: Replace the `<style scoped>` section**

Replace the entire `<style scoped>` block with:

```css
<style scoped>
.input-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(28, 28, 30, 0.96);
  border-top: 1px solid var(--ui-border);
  padding: 0 14px;
  z-index: 10;
  transition: opacity 0.15s ease;
}

.input-bar.hidden {
  display: none;
}

.input-context {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
  padding-bottom: 3px;
  font-size: 10px;
  font-family: 'Cascadia Code', Consolas, monospace;
  line-height: 1;
}

.input-cwd {
  color: var(--ui-accent);
  opacity: 0.8;
}

.input-separator {
  color: var(--ui-border);
}

.input-branch {
  color: var(--ui-fg-muted);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}

.input-prompt {
  color: var(--ui-accent);
  font-size: 14px;
  font-family: 'Cascadia Code', Consolas, monospace;
  flex-shrink: 0;
  line-height: 1;
}

.input-field {
  flex: 1;
  background: transparent;
  border: none;
  padding: 4px 0;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  outline: none;
}

.input-field:disabled {
  opacity: 0.4;
}

.history-list {
  border-top: 1px solid var(--ui-border);
  padding: 4px 0 6px;
}

.history-header {
  font-size: 9px;
  color: var(--ui-fg-muted);
  padding-bottom: 4px;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  cursor: pointer;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  border-left: 2px solid transparent;
}

.history-item:hover,
.history-item.selected {
  background: rgba(91, 156, 246, 0.12);
  border-left-color: var(--ui-accent);
}

.history-prompt {
  color: var(--ui-accent);
  font-size: 10px;
  flex-shrink: 0;
}

.history-command {
  flex: 1;
  color: var(--ui-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item.selected .history-command {
  color: var(--ui-accent);
}
</style>
```

- [ ] **Step 4: Commit**

```bash
git add src/components/InputBar.vue
git commit -m "feat: rewrite InputBar with absolute overlay and inline history list"
```

---

## Task 3: Update TerminalPane.vue

**Files:**
- Modify: `src/components/TerminalPane.vue`

Changes in this task:
1. Remove `HistorySearch` import and all references
2. Remove `showHistorySearch` state and `handleOpenHistorySearch`
3. Remove `lumiterm:history-search` event listener registration/cleanup
4. Change `pane-wrapper` style from flex to block, `terminal-container` CSS to absolute inset
5. Add `inputBarObserver` to dynamically set `.xterm` padding-bottom → correct row count

- [ ] **Step 1: Remove HistorySearch import**

Find and remove this line at the top of `<script setup>`:

```typescript
import HistorySearch from './HistorySearch.vue';
```

- [ ] **Step 2: Remove showHistorySearch ref**

Find and remove:

```typescript
const showHistorySearch = ref(false);
```

- [ ] **Step 3: Remove handleOpenHistorySearch and its event listeners**

Remove the function:

```typescript
function handleOpenHistorySearch() {
  if (props.active && props.paneActive && !isInteractiveMode.value) {
    showHistorySearch.value = true;
  }
}
```

In `onMounted`, remove this line:

```typescript
  window.addEventListener('lumiterm:history-search', handleOpenHistorySearch);
```

In `onUnmounted`, remove this line:

```typescript
  window.removeEventListener('lumiterm:history-search', handleOpenHistorySearch);
```

- [ ] **Step 4: Remove showHistorySearch.value = false from SMCUP handler**

In the `channel.onmessage` handler, find:

```typescript
    if (text.includes('\x1b[?1049h')) {
      isInteractiveMode.value = true;
      showHistorySearch.value = false;
      nextTick(() => { terminal.focus(); fitAddon.fit(); });
    }
```

Change to:

```typescript
    if (text.includes('\x1b[?1049h')) {
      isInteractiveMode.value = true;
      nextTick(() => { terminal.focus(); fitAddon.fit(); });
    }
```

- [ ] **Step 5: Add inputBarObserver for xterm padding**

Add this variable declaration at the top of the script (alongside `resizeObserver`):

```typescript
let inputBarObserver: ResizeObserver | null = null;
```

Inside the `init(container: HTMLElement)` function, after the `resizeObserver.observe(container)` call (near the end of `init`), add:

```typescript
  // ── InputBar height → xterm padding ──
  // FitAddon reads paddingBottom on the .xterm element to compute available rows.
  // This prevents the last lines from being hidden behind the InputBar overlay.
  await nextTick(); // ensure InputBar is mounted
  const inputBarEl = inputBarRef.value?.$el as HTMLElement | null;
  if (inputBarEl) {
    const applyPadding = () => {
      if (!isMounted) return;
      const h = inputBarEl.offsetHeight;
      const xtermEl = container.querySelector('.xterm') as HTMLElement | null;
      if (xtermEl) xtermEl.style.paddingBottom = h + 'px';
      fitAddon.fit();
      if (sessionId.value) {
        invoke('resize_pty_cmd', {
          sessionId: sessionId.value,
          cols: terminal.cols,
          rows: terminal.rows,
        }).catch(() => {});
      }
    };
    inputBarObserver = new ResizeObserver(applyPadding);
    inputBarObserver.observe(inputBarEl);
  }
```

In `onUnmounted`, add after `resizeObserver?.disconnect()`:

```typescript
  inputBarObserver?.disconnect();
```

- [ ] **Step 6: Update pane-wrapper style and terminal-container CSS**

In the `<template>`, find the `pane-wrapper` div opening tag:

```html
  <div
    class="pane-wrapper"
    :style="{ display: active ? 'flex' : 'none', flexDirection: 'column' }"
  >
```

Change to:

```html
  <div
    class="pane-wrapper"
    :style="{ display: active ? 'block' : 'none' }"
  >
```

In `<style scoped>`, find `.terminal-container`:

```css
.terminal-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}
```

Replace with:

```css
.terminal-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
```

- [ ] **Step 7: Remove HistorySearch from template**

Find and remove the entire `<HistorySearch .../>` block:

```html
    <HistorySearch
      :visible="showHistorySearch && !isInteractiveMode"
      @select="(cmd) => { inputBarRef?.fillCommand(cmd); showHistorySearch = false; }"
      @close="showHistorySearch = false"
    />
```

Also remove `@open-history-search` prop from the `<InputBar>` component:

```html
      @open-history-search="showHistorySearch = !showHistorySearch"
```

The `<InputBar>` tag should now be:

```html
    <InputBar
      ref="inputBarRef"
      :session-id="sessionId"
      :is-interactive="isInteractiveMode"
      :cwd="cwd"
      :git-branch="gitBranch"
    />
```

- [ ] **Step 8: Commit**

```bash
git add src/components/TerminalPane.vue
git commit -m "feat: update TerminalPane layout for InputBar overlay and xterm padding"
```

---

## Task 4: Verify in browser

- [ ] **Step 1: Start dev server**

```bash
npx pnpm tauri dev
```

- [ ] **Step 2: Verify golden path**

Check in the running app:
1. Terminal opens — InputBar is visually inside the terminal (no separate bottom bar, no border separating it)
2. Click the input field — history list appears below the input row, showing up to 10 recent commands sorted by last-used
3. Type a few characters — list filters in real-time to matching commands; frecency order applies
4. Clear the input — list reverts to recent 10
5. ArrowUp — first item in list becomes selected (highlighted with left accent border)
6. ArrowDown repeatedly — selection moves down; past last item → no selection (-1)
7. Tab with a selected item — fills input without sending
8. Enter with a selected item — executes that command, clears input, closes list
9. Escape — closes list, input content unchanged
10. Click outside input — list closes after ~150ms

- [ ] **Step 3: Verify edge cases**

1. Run `vim` or `htop` — InputBar disappears entirely (display:none), xterm goes full-screen
2. Exit vim — InputBar reappears, focus returns to input
3. Split pane (Ctrl+Shift+D) — each pane has its own independent InputBar overlay
4. Resize window — xterm rows adjust correctly, no content hidden behind InputBar
5. Paste via right-click → Paste — text appears in input field (not sent to xterm)

- [ ] **Step 4: Commit if clean**

If all checks pass:

```bash
git add -A
git commit -m "feat: inline history list complete — warp-style InputBar overlay"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Covered in |
|---|---|
| InputBar `position: absolute; bottom: 0` | Task 2 style |
| xterm `position: absolute; inset: 0` | Task 3 step 6 |
| Auto-show history on focus | Task 2 `handleFocus` |
| Filter on input (frecency) | Task 2 `historyList` computed |
| Revert to recent 10 on clear | Task 2 `historyList` computed (empty q branch) |
| Enter executes selected | Task 2 `handleKeydown` |
| Escape closes list | Task 2 `handleKeydown` |
| Blur 150ms delay close | Task 2 `handleBlur` |
| ArrowUp/Down navigate list | Task 2 `handleKeydown` |
| Tab fills without sending | Task 2 `handleKeydown` |
| Accent border on selected | Task 2 `.history-item.selected` CSS |
| Header "历史 N 条 · 输入过滤" | Task 2 template `history-header` |
| Delete HistorySearch.vue | Task 1 |
| Remove history-search event from App.vue | Task 1 |
| Remove HistorySearch from TerminalPane | Task 3 step 7 |
| Remove showHistorySearch state | Task 3 step 2 |
| xterm padding-bottom = InputBar height | Task 3 step 5 |
| Remove `↑↓ 历史` hint text | Task 2 template (not included) |
| interactive mode: InputBar hidden | Task 2 `.hidden { display: none }` |

All spec requirements are covered.
