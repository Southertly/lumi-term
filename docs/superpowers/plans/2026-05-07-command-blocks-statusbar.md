# Command Blocks 底部状态栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 28px status bar at the bottom of each terminal pane that shows the last 3 commands' status, and expands upward to show full command history on click.

**Architecture:** Create a new `CommandStatusBar.vue` component that reads from the existing `commandBlockStore`. Mount it inside `TerminalPane.vue`'s `.pane-wrapper`. The terminal container gets `padding-bottom: 28px` so its content is never hidden behind the bar.

**Tech Stack:** Vue 3 (Composition API), Pinia (`useCommandBlockStore`), CSS transitions for expand/collapse animation.

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/components/CommandStatusBar.vue` | Status bar + history panel, expand/collapse |
| Modify | `src/components/TerminalPane.vue` | Import and mount CommandStatusBar, add padding-bottom |

---

## Task 1: Create `CommandStatusBar.vue`

**Files:**
- Create: `src/components/CommandStatusBar.vue`

- [ ] **Step 1.1: Create the component file**

Create `src/components/CommandStatusBar.vue` with the full implementation:

```vue
<script setup lang="ts">
import { ref, computed } from 'vue';
import { useCommandBlockStore, type CommandBlock } from '../stores/commandBlockStore';

const props = defineProps<{ paneId: string }>();

const blockStore = useCommandBlockStore();
const expanded = ref(false);

const allBlocks = computed(() => blockStore.getBlocks(props.paneId));
const recentBlocks = computed(() => {
  const blocks = allBlocks.value;
  return blocks.slice(-3);
});

function toggle() {
  expanded.value = !expanded.value;
}

function statusIcon(block: CommandBlock): string {
  if (block.status === 'running') return '⏳';
  if (block.status === 'success') return '✓';
  return '✗';
}

function formatDuration(block: CommandBlock): string {
  if (block.status === 'running') return '运行中';
  if (!block.endTime) return '';
  const ms = block.endTime - block.startTime;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function truncate(text: string, max = 24): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}
</script>

<template>
  <div v-if="allBlocks.length > 0" class="status-bar-wrapper">
    <!-- History panel (expands upward) -->
    <div class="history-panel" :class="{ expanded }">
      <div class="history-header">
        <span>命令历史</span>
        <span class="collapse-hint">▲ 收起</span>
      </div>
      <div class="history-list">
        <div
          v-for="block in allBlocks"
          :key="block.id"
          class="history-item"
          :class="block.status"
        >
          <span class="history-icon">{{ statusIcon(block) }}</span>
          <span class="history-command">{{ block.command || '(空命令)' }}</span>
          <span class="history-duration">{{ formatDuration(block) }}</span>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar" @click="toggle" :title="expanded ? '收起历史' : '展开历史'">
      <div
        v-for="block in recentBlocks"
        :key="block.id"
        class="status-item"
        :class="block.status"
      >
        <span class="status-icon">{{ statusIcon(block) }}</span>
        <span class="status-command">{{ truncate(block.command || '(空命令)') }}</span>
        <span class="status-duration">{{ formatDuration(block) }}</span>
      </div>
      <span v-if="allBlocks.length > 3" class="status-more">+{{ allBlocks.length - 3 }}</span>
      <span class="status-toggle">{{ expanded ? '▲' : '▼' }}</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  font-family: inherit;
  font-size: 11px;
}

/* History panel */
.history-panel {
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 95%, transparent 5%);
  border-top: 1px solid var(--ui-border, #333);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.15s ease;
}

.history-panel.expanded {
  max-height: 200px;
  overflow-y: auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  color: var(--ui-fg-muted, #888);
  font-size: 10px;
  border-bottom: 1px solid var(--ui-border, #333);
}

.collapse-hint {
  font-size: 9px;
  opacity: 0.6;
}

.history-list {
  padding: 2px 0;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  color: var(--ui-fg-muted, #aaa);
}

.history-item:hover {
  background: var(--ui-hover, rgba(255,255,255,0.05));
}

.history-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.history-item.success .history-icon { color: #4caf50; }
.history-item.error   .history-icon { color: #f44336; }
.history-item.running .history-icon { color: #ff9800; }

.history-command {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-fg, #ccc);
}

.history-duration {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  flex-shrink: 0;
}

/* Status bar */
.status-bar {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 92%, transparent 8%);
  border-top: 1px solid var(--ui-border, #333);
  cursor: pointer;
  user-select: none;
}

.status-bar:hover {
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 85%, var(--ui-accent, #4a9eff) 15%);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.status-icon {
  flex-shrink: 0;
}

.status-item.success .status-icon { color: #4caf50; }
.status-item.error   .status-icon { color: #f44336; }
.status-item.running .status-icon { color: #ff9800; }

.status-command {
  color: var(--ui-fg, #ccc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.status-duration {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  flex-shrink: 0;
}

.status-more {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  margin-left: auto;
}

.status-toggle {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  margin-left: auto;
}

.status-more + .status-toggle {
  margin-left: 4px;
}
</style>
```

- [ ] **Step 1.2: Commit**

```powershell
git add src/components/CommandStatusBar.vue
git commit -m "feat: add CommandStatusBar component with expand/collapse history panel"
```

---

## Task 2: Wire CommandStatusBar into TerminalPane

**Files:**
- Modify: `src/components/TerminalPane.vue`

- [ ] **Step 2.1: Add import**

In `src/components/TerminalPane.vue`, replace the existing import block (lines 1–12):

```typescript
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { initTerminal, type TerminalInstance } from '../utils/xtermInitializer';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore } from '../stores/fontStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import { OscParser } from '../utils/oscParser';
import { useCommandBlockStore } from '../stores/commandBlockStore';
import CommandBlock from './CommandBlock.vue';
import CommandStatusBar from './CommandStatusBar.vue';
```

- [ ] **Step 2.2: Add CommandStatusBar to template**

In `src/components/TerminalPane.vue`, find the commented-out overlay block and the right-click context menu comment. Replace:

```html
    <!-- Command block overlay (temporarily disabled - UI needs optimization) -->
    <!--
    <div class="block-overlay" aria-hidden="true">
      <CommandBlock
        v-for="block in blockStore.getBlocks(paneId)"
        :key="block.id"
        :block="block"
      />
    </div>
    -->

    <!-- Right-click context menu -->
```

With:

```html
    <!-- Command status bar -->
    <CommandStatusBar :pane-id="paneId" />

    <!-- Right-click context menu -->
```

- [ ] **Step 2.3: Add padding-bottom to terminal container**

In `src/components/TerminalPane.vue`, find the `.terminal-container` CSS rule in `<style scoped>`:

```css
.terminal-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
```

Replace with:

```css
.terminal-container {
  position: absolute;
  inset: 0;
  overflow: hidden;
  padding-bottom: 28px;
}
```

- [ ] **Step 2.4: Commit**

```powershell
git add src/components/TerminalPane.vue
git commit -m "feat: mount CommandStatusBar in TerminalPane"
```

---

## Task 3: Manual Verification

- [ ] **Step 3.1: Start dev server**

```powershell
npx pnpm tauri dev
```

- [ ] **Step 3.2: Manual test checklist**

1. Open a terminal tab
2. Run `echo hello` → status bar appears at bottom with ✓ green icon
3. Run `nonexistent-command` → ✗ red icon appears in status bar
4. Click the status bar → history panel expands upward showing all commands
5. Click again → panel collapses
6. Run more than 3 commands → status bar shows last 3 + "+N" count
7. Terminal content is not hidden behind the status bar (scroll to bottom to verify)
8. Close the tab → no console errors

- [ ] **Step 3.3: Run frontend tests to check for regressions**

```powershell
npx vitest run src/utils/oscParser.test.ts src/stores/commandBlockStore.test.ts
```

Expected: 15 tests passing.

- [ ] **Step 3.4: Final commit if any fixes were needed**

```powershell
git add -A
git commit -m "fix: address issues found during manual verification"
```
