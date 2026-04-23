# Warp 风格改造 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LumiTerm 改造为 Warp 风格：底部输入栏 + Frecency 历史 + 设置面板（主题/字体/快捷键）+ 右键菜单。

**Architecture:** xterm.js 仅负责输出渲染；新建 `InputBar.vue` 接管命令输入；`HistorySearch.vue` 提供 Ctrl+R 模糊搜索；`SettingsModal.vue` 提供三分页设置；`shortcutsStore` + `historyStore` + `fontStore` 管理持久化状态。

**Tech Stack:** Vue 3 + Pinia + xterm.js + Tauri v2 (Rust backend) + localStorage

---

## File Map

| 文件 | 操作 |
|---|---|
| `src/utils/xtermInitializer.ts` | 修改：`TerminalTheme` 加 `cursorAccent?`；`initTerminal` 接受 font 选项 |
| `src/stores/themeStore.ts` | 修改：在 index 0 插入 Warp Dark 主题 |
| `src/stores/historyStore.ts` | **新建**：Frecency 历史 Pinia store |
| `src/stores/shortcutsStore.ts` | **新建**：自定义快捷键 Pinia store |
| `src/stores/fontStore.ts` | **新建**：字体设置 Pinia store |
| `src/components/InputBar.vue` | **新建**：底部固定输入栏 |
| `src/components/HistorySearch.vue` | **新建**：Ctrl+R 模糊搜索浮层 |
| `src/components/SettingsModal.vue` | **新建**：设置模态框 |
| `src/components/TerminalPane.vue` | 修改：集成 InputBar/HistorySearch，OSC 7，SMCUP/RMCUP，右键菜单，移除旧 overlay |
| `src/components/TabBar.vue` | 修改：⚙ 按钮触发 settings 事件 |
| `src/App.vue` | 修改：渲染 SettingsModal，全局快捷键，启动 cleanup |
| `src-tauri/src/commands/pty.rs` | 修改：新增 `get_git_branch` 命令 |
| `src-tauri/src/lib.rs` | 修改：注册 `get_git_branch` |

---

## Task 1: Warp Dark 主题 + TerminalTheme 类型扩展

**Files:**
- Modify: `src/utils/xtermInitializer.ts`
- Modify: `src/stores/themeStore.ts`

- [ ] **Step 1.1: 扩展 TerminalTheme 接口（xtermInitializer.ts）**

在 `src/utils/xtermInitializer.ts` 的 `TerminalTheme` 接口中加入 `cursorAccent?`：

```typescript
export interface TerminalTheme {
  background: string;
  foreground: string;
  cursor: string;
  cursorAccent?: string;   // ← 新增
  selectionBackground: string;
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
  brightBlack: string;
  brightRed: string;
  brightGreen: string;
  brightYellow: string;
  brightBlue: string;
  brightMagenta: string;
  brightCyan: string;
  brightWhite: string;
}
```

- [ ] **Step 1.2: 让 initTerminal 接受字体选项**

修改 `src/utils/xtermInitializer.ts` 中 `initTerminal` 的签名和实现：

```typescript
export interface FontOptions {
  fontFamily?: string;
  fontSize?: number;
  lineHeight?: number;
}

export function initTerminal(
  container: HTMLElement,
  theme?: TerminalTheme,
  font?: FontOptions,
): TerminalInstance {
  const terminal = new Terminal({
    fontFamily: font?.fontFamily
      ? `"${font.fontFamily}", Consolas, monospace`
      : '"Cascadia Code", Consolas, monospace',
    fontSize: font?.fontSize ?? 13,
    lineHeight: font?.lineHeight ?? 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    allowTransparency: true,
    scrollback: 10000,
    theme,
  });
  // ... rest unchanged
```

- [ ] **Step 1.3: 在 themeStore.ts 的 themes 数组 index 0 插入 Warp Dark**

将以下对象插入 `themes` 数组的最前面（在 `catppuccin-mocha` 之前）：

```typescript
{
  name: 'warp-dark',
  label: 'Warp Dark',
  ui: {
    bg: '#111113',
    bgLight: '#1c1c1e',
    bgLighter: '#252528',
    fg: '#e8e8e8',
    fgMuted: '#6e6e73',
    accent: '#5b9cf6',
    border: '#2a2a2e',
    hover: '#3a3a3e',
  },
  terminal: {
    background: '#1c1c1e',
    foreground: '#e8e8e8',
    cursor: '#5b9cf6',
    cursorAccent: '#1c1c1e',
    selectionBackground: '#3a3a3e',
    black: '#1c1c1e',       brightBlack: '#6e6e73',
    red: '#ff6b6b',         brightRed: '#ff8585',
    green: '#a6e3a1',       brightGreen: '#b8f0b3',
    yellow: '#ffd93d',      brightYellow: '#ffe066',
    blue: '#5b9cf6',        brightBlue: '#7db3ff',
    magenta: '#c792ea',     brightMagenta: '#d4a8f5',
    cyan: '#89ddff',        brightCyan: '#a3e8ff',
    white: '#c8c8c8',       brightWhite: '#ffffff',
  },
},
```

因为 `themes[0]` 是默认值，Warp Dark 自动成为新安装用户的默认主题。已有用户的 localStorage 保留其原来的选择。

- [ ] **Step 1.4: 启动 dev server 验证主题**

```bash
npx pnpm tauri dev
```

预期：应用启动后 UI 呈深黑色（`#111113` 标题栏，`#1c1c1e` 终端区域）。设置下拉中 "Warp Dark" 应出现在列表首位。切换其他主题仍正常工作。

- [ ] **Step 1.5: 提交**

```bash
git add src/utils/xtermInitializer.ts src/stores/themeStore.ts
git commit -m "feat: add Warp Dark theme and extend TerminalTheme interface"
```

---

## Task 2: historyStore（Frecency 历史）

**Files:**
- Create: `src/stores/historyStore.ts`

- [ ] **Step 2.1: 创建 historyStore.ts**

新建 `src/stores/historyStore.ts`：

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface HistoryEntry {
  command: string;
  useCount: number;
  lastUsedAt: number; // Unix ms
}

const STORAGE_KEY = 'lumiterm_history_v2';
const MAX_ENTRIES = 1000;
const CLEANUP_SCORE_THRESHOLD = 0.05;

function frecencyScore(entry: HistoryEntry): number {
  const daysSince = (Date.now() - entry.lastUsedAt) / 86_400_000;
  return entry.useCount / Math.log(daysSince + 2);
}

function load(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

function persist(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* storage full */ }
}

export const useHistoryStore = defineStore('history', () => {
  const entries = ref<HistoryEntry[]>(load());

  function add(command: string) {
    const cmd = command.trim();
    if (!cmd) return;

    const existing = entries.value.find((e) => e.command === cmd);
    if (existing) {
      existing.useCount++;
      existing.lastUsedAt = Date.now();
    } else {
      entries.value.push({ command: cmd, useCount: 1, lastUsedAt: Date.now() });
    }

    if (entries.value.length > MAX_ENTRIES) cleanup();
    else persist(entries.value);
  }

  function search(query: string): HistoryEntry[] {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? entries.value.filter((e) => e.command.toLowerCase().includes(q))
      : entries.value;
    return [...filtered]
      .sort((a, b) => frecencyScore(b) - frecencyScore(a))
      .slice(0, 50);
  }

  function list(): HistoryEntry[] {
    return [...entries.value].sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  }

  function cleanup() {
    entries.value = entries.value
      .filter((e) => frecencyScore(e) >= CLEANUP_SCORE_THRESHOLD)
      .sort((a, b) => frecencyScore(b) - frecencyScore(a))
      .slice(0, MAX_ENTRIES);
    persist(entries.value);
  }

  return { entries, add, search, list, cleanup };
});
```

- [ ] **Step 2.2: 手动验证 frecency 逻辑（browser console）**

启动 dev server 后，在浏览器 console 运行：

```javascript
// 临时验证 frecency 公式
function score(useCount, daysSince) {
  return useCount / Math.log(daysSince + 2);
}
console.log('1次/30天:', score(1, 30).toFixed(3));   // ~0.33 (> 0.05, 保留)
console.log('1次/365天:', score(1, 365).toFixed(3)); // ~0.17 (> 0.05, 保留)
console.log('1次/1000天:', score(1, 1000).toFixed(3)); // ~0.14 (> 0.05, 保留)
// 实际上 score < 0.05 只在极端低频+超长时间才出现，这是合理的
```

- [ ] **Step 2.3: 提交**

```bash
git add src/stores/historyStore.ts
git commit -m "feat: add historyStore with frecency-based retention"
```

---

## Task 3: shortcutsStore + fontStore

**Files:**
- Create: `src/stores/shortcutsStore.ts`
- Create: `src/stores/fontStore.ts`

- [ ] **Step 3.1: 创建 shortcutsStore.ts**

新建 `src/stores/shortcutsStore.ts`：

```typescript
import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ShortcutAction =
  | 'copy' | 'paste' | 'cut'
  | 'new-tab' | 'close-tab' | 'next-tab' | 'prev-tab'
  | 'history-search' | 'open-settings';

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  'copy': '复制',
  'paste': '粘贴',
  'cut': '剪切',
  'new-tab': '新建标签页',
  'close-tab': '关闭标签页',
  'next-tab': '切换到下一个',
  'prev-tab': '切换到上一个',
  'history-search': '搜索历史命令',
  'open-settings': '打开设置',
};

export const SHORTCUT_GROUPS: { label: string; actions: ShortcutAction[] }[] = [
  { label: '编辑', actions: ['copy', 'paste', 'cut'] },
  { label: '标签页', actions: ['new-tab', 'close-tab', 'next-tab', 'prev-tab'] },
  { label: '历史', actions: ['history-search'] },
  { label: '设置', actions: ['open-settings'] },
];

const DEFAULT_BINDINGS: Record<ShortcutAction, string> = {
  'copy': 'Ctrl+C',
  'paste': 'Ctrl+V',
  'cut': 'Ctrl+X',
  'new-tab': 'Ctrl+T',
  'close-tab': 'Ctrl+W',
  'next-tab': 'Ctrl+Tab',
  'prev-tab': 'Ctrl+Shift+Tab',
  'history-search': 'Ctrl+R',
  'open-settings': 'Ctrl+,',
};

const STORAGE_KEY = 'lumiterm_shortcuts';

export function keyEventToString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const key = e.key === 'Tab' ? 'Tab'
    : e.key.length === 1 ? e.key.toUpperCase()
    : e.key;
  parts.push(key);
  return parts.join('+');
}

function loadBindings(): Record<ShortcutAction, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  const bindings = ref<Record<ShortcutAction, string>>(loadBindings());

  function getKey(action: ShortcutAction): string {
    return bindings.value[action];
  }

  function hasConflict(key: string): ShortcutAction | null {
    for (const [action, binding] of Object.entries(bindings.value)) {
      if (binding === key) return action as ShortcutAction;
    }
    return null;
  }

  function setKey(action: ShortcutAction, key: string): boolean {
    const conflict = hasConflict(key);
    if (conflict && conflict !== action) return false;
    bindings.value[action] = key;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.value)); } catch { /* */ }
    return true;
  }

  function resetAll() {
    bindings.value = { ...DEFAULT_BINDINGS };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  }

  function matchesEvent(action: ShortcutAction, e: KeyboardEvent): boolean {
    return bindings.value[action] === keyEventToString(e);
  }

  return { bindings, getKey, hasConflict, setKey, resetAll, matchesEvent };
});
```

- [ ] **Step 3.2: 创建 fontStore.ts**

新建 `src/stores/fontStore.ts`：

```typescript
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'lumiterm_font';

export const FONT_OPTIONS = [
  'Cascadia Code',
  'JetBrains Mono',
  'Fira Code',
  'Consolas',
  'SF Mono',
  'Source Code Pro',
] as const;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { fontFamily: string; fontSize: number; lineHeight: number };
  } catch { /* */ }
  return { fontFamily: 'Cascadia Code', fontSize: 13, lineHeight: 1.2 };
}

export const useFontStore = defineStore('font', () => {
  const saved = load();
  const fontFamily = ref(saved.fontFamily);
  const fontSize = ref(saved.fontSize);
  const lineHeight = ref(saved.lineHeight);

  watch([fontFamily, fontSize, lineHeight], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontFamily: fontFamily.value,
        fontSize: fontSize.value,
        lineHeight: lineHeight.value,
      }));
    } catch { /* */ }
  });

  return { fontFamily, fontSize, lineHeight, FONT_OPTIONS };
});
```

- [ ] **Step 3.3: 提交**

```bash
git add src/stores/shortcutsStore.ts src/stores/fontStore.ts
git commit -m "feat: add shortcutsStore and fontStore"
```

---

## Task 4: Rust get_git_branch 命令

**Files:**
- Modify: `src-tauri/src/commands/pty.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 4.1: 在 pty.rs 末尾添加 get_git_branch**

在 `src-tauri/src/commands/pty.rs` 的末尾追加：

```rust
#[tauri::command]
pub async fn get_git_branch(path: String) -> String {
    let result = tokio::task::spawn_blocking(move || {
        std::process::Command::new("git")
            .args(["rev-parse", "--abbrev-ref", "HEAD"])
            .current_dir(&path)
            .output()
    })
    .await;

    match result {
        Ok(Ok(output)) if output.status.success() => {
            String::from_utf8_lossy(&output.stdout).trim().to_string()
        }
        _ => String::new(),
    }
}
```

- [ ] **Step 4.2: 在 lib.rs 中导入并注册命令**

修改 `src-tauri/src/lib.rs`：

```rust
use commands::pty::{
    close_app, close_pty_cmd, create_pty, get_git_branch,  // ← 加入 get_git_branch
    init_pty_store, minimize_window, resize_pty_cmd, toggle_maximize, write_pty_cmd,
};
```

在 `invoke_handler` 列表中加入 `get_git_branch`：

```rust
.invoke_handler(tauri::generate_handler![
    create_pty,
    write_pty_cmd,
    resize_pty_cmd,
    close_pty_cmd,
    close_app,
    minimize_window,
    toggle_maximize,
    get_git_branch,   // ← 新增
])
```

- [ ] **Step 4.3: 验证 Rust 编译通过**

```bash
cd src-tauri && cargo check
```

预期输出：`Finished` without errors。如果报 `tokio` 未找到，在 `src-tauri/Cargo.toml` 中确认 `tauri` 特性包含 async runtime（Tauri 2 默认包含 tokio）。

- [ ] **Step 4.4: 提交**

```bash
git add src-tauri/src/commands/pty.rs src-tauri/src/lib.rs
git commit -m "feat(rust): add async get_git_branch tauri command"
```

---

## Task 5: InputBar.vue

**Files:**
- Create: `src/components/InputBar.vue`

- [ ] **Step 5.1: 创建 InputBar.vue**

新建 `src/components/InputBar.vue`：

```vue
<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useHistoryStore } from '../stores/historyStore';

const props = defineProps<{
  sessionId: string | null;
  isInteractive: boolean;
  cwd: string;
  gitBranch: string;
}>();

const emit = defineEmits<{
  openHistorySearch: [];
}>();

const historyStore = useHistoryStore();
const inputValue = ref('');
const historyIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

// When interactive mode ends, auto-focus the input bar
watch(() => props.isInteractive, (interactive) => {
  if (!interactive) {
    nextTick(() => inputRef.value?.focus());
  }
});

function displayCwd(cwd: string): string {
  if (!cwd) return '';
  // Replace Windows-style home dir with ~
  const home = cwd.match(/^[A-Z]:\\Users\\[^\\]+/i)?.[0] ?? '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length).replace(/\\/g, '/');
  }
  return cwd.replace(/\\/g, '/');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateHistory(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateHistory(1);
  } else if (e.ctrlKey && e.key === 'r') {
    e.preventDefault();
    emit('openHistorySearch');
  }
}

function navigateHistory(direction: -1 | 1) {
  const list = historyStore.list();
  if (list.length === 0) return;

  if (historyIndex.value === -1 && direction === -1) {
    historyIndex.value = 0;
  } else {
    const next = historyIndex.value + direction;
    historyIndex.value = Math.max(-1, Math.min(list.length - 1, next));
  }

  inputValue.value = historyIndex.value === -1 ? '' : list[historyIndex.value].command;
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
  historyIndex.value = -1;
}

function fillCommand(command: string) {
  inputValue.value = command;
  historyIndex.value = -1;
  nextTick(() => inputRef.value?.focus());
}

defineExpose({ fillCommand, focus: () => inputRef.value?.focus() });
</script>

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
      />
      <span class="input-hints">↑↓ 历史&nbsp;&nbsp;⌅ 发送</span>
    </div>
  </div>
</template>

<style scoped>
.input-bar {
  background: var(--ui-bg-lighter);
  border-top: 1px solid var(--ui-border);
  padding: 0 14px;
  flex-shrink: 0;
  overflow: hidden;
  transition: height 0.15s ease, opacity 0.15s ease;
  height: 52px;
  opacity: 1;
}

.input-bar.hidden {
  height: 0;
  opacity: 0;
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
  padding-bottom: 7px;
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
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  padding: 5px 10px;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  outline: none;
  transition: border-color 0.1s;
}

.input-field:focus {
  border-color: var(--ui-accent);
}

.input-field:disabled {
  opacity: 0.4;
}

.input-hints {
  color: var(--ui-fg-muted);
  font-size: 9px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
```

- [ ] **Step 5.2: 提交**

```bash
git add src/components/InputBar.vue
git commit -m "feat: add InputBar component with frecency history navigation"
```

---

## Task 6: HistorySearch.vue

**Files:**
- Create: `src/components/HistorySearch.vue`

- [ ] **Step 6.1: 创建 HistorySearch.vue**

新建 `src/components/HistorySearch.vue`：

```vue
<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useHistoryStore, type HistoryEntry } from '../stores/historyStore';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  select: [command: string];
  close: [];
}>();

const historyStore = useHistoryStore();
const query = ref('');
const selectedIndex = ref(0);
const searchRef = ref<HTMLInputElement | null>(null);

const results = computed<HistoryEntry[]>(() =>
  historyStore.search(query.value).slice(0, 8)
);

watch(() => props.visible, (visible) => {
  if (visible) {
    query.value = '';
    selectedIndex.value = 0;
    nextTick(() => searchRef.value?.focus());
  }
});

watch(results, () => {
  selectedIndex.value = 0;
});

function formatAge(lastUsedAt: number): string {
  const mins = Math.floor((Date.now() - lastUsedAt) / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results.value[selectedIndex.value]) {
      emit('select', results.value[selectedIndex.value].command);
    }
  }
}

function selectItem(command: string) {
  emit('select', command);
}
</script>

<template>
  <div v-if="visible" class="history-search" @click.stop>
    <div class="hs-header">
      <span class="hs-icon">🔍</span>
      <input
        ref="searchRef"
        v-model="query"
        class="hs-input"
        type="text"
        placeholder="搜索历史命令…"
        autocomplete="off"
        @keydown="handleKeydown"
      />
      <span class="hs-close" @click="emit('close')">ESC</span>
    </div>
    <div class="hs-list">
      <div
        v-for="(entry, idx) in results"
        :key="entry.command"
        class="hs-item"
        :class="{ selected: idx === selectedIndex }"
        @click="selectItem(entry.command)"
        @mouseover="selectedIndex = idx"
      >
        <span class="hs-prompt">❯</span>
        <span class="hs-command">{{ entry.command }}</span>
        <span class="hs-age">{{ formatAge(entry.lastUsedAt) }}</span>
      </div>
      <div v-if="results.length === 0" class="hs-empty">
        无匹配命令
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-search {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 60px; /* above InputBar */
  z-index: 200;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.hs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
}

.hs-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.hs-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.hs-input::placeholder {
  color: var(--ui-fg-muted);
}

.hs-close {
  color: var(--ui-fg-muted);
  font-size: 9px;
  cursor: pointer;
  border: 1px solid var(--ui-border);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.hs-list {
  max-height: 220px;
  overflow-y: auto;
}

.hs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.hs-item.selected {
  background: color-mix(in srgb, var(--ui-accent) 15%, transparent);
}

.hs-prompt {
  color: var(--ui-accent);
  font-size: 10px;
  flex-shrink: 0;
}

.hs-command {
  flex: 1;
  color: var(--ui-fg);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-age {
  color: var(--ui-fg-muted);
  font-size: 9px;
  flex-shrink: 0;
}

.hs-empty {
  padding: 12px;
  color: var(--ui-fg-muted);
  font-size: 11px;
  text-align: center;
}
</style>
```

- [ ] **Step 6.2: 提交**

```bash
git add src/components/HistorySearch.vue
git commit -m "feat: add HistorySearch component with frecency-sorted fuzzy search"
```

---

## Task 7: TerminalPane.vue 重构

**Files:**
- Modify: `src/components/TerminalPane.vue`

这是改动最大的任务。用完整的新版本替换现有文件。

- [ ] **Step 7.1: 替换 TerminalPane.vue 的 `<script setup>` 块**

将 `src/components/TerminalPane.vue` 的整个 `<script setup>` 替换为：

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { initTerminal, type TerminalInstance } from '../utils/xtermInitializer';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore } from '../stores/fontStore';
import { useShortcutsStore } from '../stores/shortcutsStore';
import InputBar from './InputBar.vue';
import HistorySearch from './HistorySearch.vue';

const props = defineProps<{
  paneId: string;
  tabId: string;
  shellType: ShellType;
  active: boolean;
  paneActive: boolean;
}>();

const store = useTerminalStore();
const themeStore = useThemeStore();
const fontStore = useFontStore();
const shortcutsStore = useShortcutsStore();

// ── Pane close button ──
const showCloseButton = computed(() => {
  const tab = store.tabs.find((t) => t.id === props.tabId);
  return !!tab && tab.panes.length > 1;
});

function handleClose() {
  const tab = store.tabs.find((t) => t.id === props.tabId);
  const nextPane = tab?.panes.find((p) => p.id !== props.paneId);
  store.closePane(props.tabId, props.paneId);
  if (nextPane) {
    window.dispatchEvent(new CustomEvent('lumiterm:focus-pane', {
      detail: { tabId: props.tabId, paneId: nextPane.id },
    }));
  }
}

// ── Terminal refs ──
const terminalRef = ref<HTMLElement | null>(null);
const inputBarRef = ref<InstanceType<typeof InputBar> | null>(null);
let instance: TerminalInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let isMounted = true;

// ── Warp-style state ──
const sessionId = ref<string | null>(null);
const isInteractiveMode = ref(false);
const cwd = ref('');
const gitBranch = ref('');
const showHistorySearch = ref(false);

// ── Right-click context menu ──
const contextMenu = ref<{ x: number; y: number } | null>(null);
const hasTerminalSelection = ref(false);

function closeContextMenu() {
  contextMenu.value = null;
}

async function handleCopy() {
  const selection = instance?.terminal.getSelection();
  if (selection) {
    await navigator.clipboard.writeText(selection).catch(() => {});
    instance?.terminal.clearSelection();
  }
  closeContextMenu();
}

async function handlePaste() {
  const text = await navigator.clipboard.readText().catch(() => '');
  if (text && sessionId.value) {
    instance?.terminal.paste(text);
  }
  closeContextMenu();
}

function handleCut() {
  handleCopy(); // terminal cut = copy (no delete)
}

// ── Git branch fetch ──
async function fetchGitBranch(path: string) {
  if (!path) { gitBranch.value = ''; return; }
  try {
    gitBranch.value = await invoke<string>('get_git_branch', { path });
  } catch {
    gitBranch.value = '';
  }
}

// ── Shell commands ──
const shellCommands: Record<ShellType, string> = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  wsl2: 'wsl.exe',
};

// ── OSC 7 parser ──
function parseOsc7(text: string): string | null {
  // Matches \x1b]7;file://hostname/path\x07  or  \x1b]7;file://hostname/path\x1b\\
  const m = text.match(/\x1b\]7;file:\/\/[^/]*([^\x07\x1b]*)(?:\x07|\x1b\\)/);
  if (!m) return null;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

// ── Main init ──
async function init(container: HTMLElement) {
  instance = initTerminal(container, themeStore.getCurrentTheme().terminal, {
    fontFamily: fontStore.fontFamily,
    fontSize: fontStore.fontSize,
    lineHeight: fontStore.lineHeight,
  });
  const { terminal, fitAddon } = instance;

  // ── PTY output handler ──
  const channel = new Channel<number[]>();
  channel.onmessage = (rawData) => {
    const bytes = new Uint8Array(rawData);
    const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);

    // Interactive mode detection (alternate screen buffer)
    if (text.includes('\x1b[?1049h')) {
      isInteractiveMode.value = true;
      showHistorySearch.value = false;
      nextTick(() => { terminal.focus(); fitAddon.fit(); });
    }
    if (text.includes('\x1b[?1049l')) {
      isInteractiveMode.value = false;
      nextTick(() => { inputBarRef.value?.focus(); fitAddon.fit(); });
    }

    // OSC 7: current working directory
    const newCwd = parseOsc7(text);
    if (newCwd && newCwd !== cwd.value) {
      cwd.value = newCwd;
      fetchGitBranch(newCwd);
    }

    terminal.write(bytes);
  };

  // ── Spawn PTY ──
  try {
    const sid = await invoke<string>('create_pty', {
      shell: shellCommands[props.shellType],
      cols: terminal.cols,
      rows: terminal.rows,
      channel,
    });
    sessionId.value = sid;
    store.setPaneSessionId(props.tabId, props.paneId, sid);
  } catch (e) {
    terminal.write(`\r\nFailed to start shell: ${e}\r\n`);
    return;
  }

  // ── Focus tracking ──
  terminal.element?.addEventListener('focus', () => {
    store.setActivePane(props.tabId, props.paneId);
    // In normal mode, redirect focus back to InputBar
    if (!isInteractiveMode.value) {
      nextTick(() => inputBarRef.value?.focus());
    }
  });

  // ── Right-click menu ──
  container.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    hasTerminalSelection.value = !!terminal.hasSelection();
    contextMenu.value = { x: e.clientX, y: e.clientY };
  });

  // ── Keyboard filter ──
  terminal.attachCustomKeyEventHandler((e) => {
    if (e.type !== 'keydown') return true;

    // In interactive mode: pass through everything except app-level shortcuts
    if (isInteractiveMode.value) {
      if (e.ctrlKey && !e.shiftKey && (e.key === 't' || e.key === 'w')) return false;
      if (e.ctrlKey && e.key === 'Tab') return false;
      if (e.ctrlKey && e.shiftKey && (e.key === 'D' || e.key === 'E' || e.key === 'W')) return false;
      if (e.key === 'F2') return false;
      return true;
    }

    // In normal mode: block all keyboard input to xterm (InputBar handles it)
    return false;
  });

  // ── PTY write (interactive mode only) ──
  terminal.onData((data) => {
    if (!sessionId.value || !isInteractiveMode.value) return;
    invoke('write_pty_cmd', {
      sessionId: sessionId.value,
      data: Array.from(new TextEncoder().encode(data)),
    }).catch(() => {});
  });

  // ── Resize observer ──
  resizeObserver = new ResizeObserver(() => {
    if (!isMounted) return;
    fitAddon.fit();
    if (sessionId.value) {
      invoke('resize_pty_cmd', {
        sessionId: sessionId.value,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {});
    }
  });
  resizeObserver.observe(container);

  // Auto-focus InputBar after init
  nextTick(() => inputBarRef.value?.focus());
}

// ── Watchers ──
watch(() => themeStore.currentName, () => {
  if (instance) instance.terminal.options.theme = themeStore.getCurrentTheme().terminal;
});

watch([() => fontStore.fontFamily, () => fontStore.fontSize, () => fontStore.lineHeight], () => {
  if (instance) {
    instance.terminal.options.fontFamily = `"${fontStore.fontFamily}", Consolas, monospace`;
    instance.terminal.options.fontSize = fontStore.fontSize;
    instance.terminal.options.lineHeight = fontStore.lineHeight;
    instance.fitAddon.fit();
  }
});

watch(
  [() => props.active, () => props.paneActive],
  ([tabActive, paneActive]) => {
    if (tabActive && paneActive && instance) {
      setTimeout(() => {
        instance!.fitAddon.fit();
        if (!isInteractiveMode.value) inputBarRef.value?.focus();
      }, 50);
    }
  }
);

// Close context menu on outside click
function handleGlobalClick() {
  if (contextMenu.value) closeContextMenu();
}

function handleFocusPane(e: Event) {
  const { tabId, paneId } = (e as CustomEvent).detail;
  if (tabId === props.tabId && paneId === props.paneId && instance) {
    if (isInteractiveMode.value) instance.terminal.focus();
    else inputBarRef.value?.focus();
  }
}

// Handle copy/paste/cut events from App.vue
function handleTerminalCopy() { if (props.active && props.paneActive) handleCopy(); }
function handleTerminalPaste() { if (props.active && props.paneActive) handlePaste(); }
function handleTerminalCut() { if (props.active && props.paneActive) handleCut(); }
function handleOpenHistorySearch() {
  if (props.active && props.paneActive && !isInteractiveMode.value) {
    showHistorySearch.value = true;
  }
}

onMounted(() => {
  if (terminalRef.value) init(terminalRef.value);
  window.addEventListener('lumiterm:focus-pane', handleFocusPane);
  window.addEventListener('lumiterm:copy', handleTerminalCopy);
  window.addEventListener('lumiterm:paste', handleTerminalPaste);
  window.addEventListener('lumiterm:cut', handleTerminalCut);
  window.addEventListener('lumiterm:history-search', handleOpenHistorySearch);
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  isMounted = false;
  window.removeEventListener('lumiterm:focus-pane', handleFocusPane);
  window.removeEventListener('lumiterm:copy', handleTerminalCopy);
  window.removeEventListener('lumiterm:paste', handleTerminalPaste);
  window.removeEventListener('lumiterm:cut', handleTerminalCut);
  window.removeEventListener('lumiterm:history-search', handleOpenHistorySearch);
  document.removeEventListener('click', handleGlobalClick);
  resizeObserver?.disconnect();
  if (sessionId.value) invoke('close_pty_cmd', { sessionId: sessionId.value }).catch(() => {});
  instance?.dispose();
});
</script>
```

- [ ] **Step 7.2: 替换 TerminalPane.vue 的 `<template>` 块**

```vue
<template>
  <div
    class="pane-wrapper"
    :style="{ display: active ? 'flex' : 'none', flexDirection: 'column' }"
  >
    <button
      v-if="showCloseButton"
      class="pane-close-btn"
      title="关闭分屏"
      @click.stop="handleClose"
    >×</button>

    <div
      ref="terminalRef"
      class="terminal-container"
      :class="{ 'pane-active': paneActive }"
      :style="{ background: themeStore.getCurrentTheme().terminal.background }"
    />

    <HistorySearch
      :visible="showHistorySearch && !isInteractiveMode"
      @select="(cmd) => { inputBarRef?.fillCommand(cmd); showHistorySearch = false; }"
      @close="showHistorySearch = false"
    />

    <InputBar
      ref="inputBarRef"
      :session-id="sessionId"
      :is-interactive="isInteractiveMode"
      :cwd="cwd"
      :git-branch="gitBranch"
      @open-history-search="showHistorySearch = !showHistorySearch"
    />

    <!-- Right-click context menu -->
    <Teleport to="body">
      <div
        v-if="contextMenu"
        class="terminal-ctx-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div
          class="ctx-item"
          :class="{ disabled: !hasTerminalSelection }"
          @click="hasTerminalSelection && handleCopy()"
        >
          复制
          <span class="ctx-hint">{{ shortcutsStore.getKey('copy') }}</span>
        </div>
        <div class="ctx-item" @click="handlePaste()">
          粘贴
          <span class="ctx-hint">{{ shortcutsStore.getKey('paste') }}</span>
        </div>
        <div
          class="ctx-item"
          :class="{ disabled: !hasTerminalSelection }"
          @click="hasTerminalSelection && handleCut()"
        >
          剪切
          <span class="ctx-hint">{{ shortcutsStore.getKey('cut') }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>
```

- [ ] **Step 7.3: 替换 TerminalPane.vue 的 `<style>` 块**

```vue
<style scoped>
.pane-wrapper {
  position: relative;
  isolation: isolate;
  width: 100%;
  height: 100%;
}

.terminal-container {
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.terminal-container.pane-active {
  box-shadow: inset 0 0 0 1px var(--ui-accent);
}

.pane-close-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  z-index: 100;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: none;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s ease;
}

.pane-wrapper:hover .pane-close-btn {
  opacity: 1;
  pointer-events: auto;
}

.pane-close-btn:hover {
  background: rgba(220, 50, 50, 0.8);
}
</style>

<!-- Global styles for context menu (not scoped - teleported to body) -->
<style>
.terminal-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 140px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  font-family: system-ui, sans-serif;
  font-size: 12px;
}

.ctx-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  color: var(--ui-fg);
  cursor: pointer;
  gap: 16px;
}

.ctx-item:hover:not(.disabled) {
  background: var(--ui-hover);
}

.ctx-item.disabled {
  color: var(--ui-fg-muted);
  cursor: default;
}

.ctx-hint {
  color: var(--ui-fg-muted);
  font-size: 10px;
}
</style>
```

- [ ] **Step 7.4: 启动并验证 TerminalPane**

```bash
npx pnpm tauri dev
```

验证清单：
- [ ] 终端启动后底部出现 InputBar（高度 ~52px）
- [ ] 在 InputBar 输入 `echo hello` 并回车，终端显示输出
- [ ] `↑` 键填入上一条命令
- [ ] `Ctrl+R` 打开 HistorySearch 浮层，输入过滤，回车选中
- [ ] 在终端运行 `vim` → InputBar 自动隐藏，vim 全屏
- [ ] 退出 vim (`:q`) → InputBar 重新出现
- [ ] 右键终端区域 → 出现「复制/粘贴/剪切」菜单

- [ ] **Step 7.5: 提交**

```bash
git add src/components/TerminalPane.vue
git commit -m "feat: refactor TerminalPane with InputBar, HistorySearch, OSC7, SMCUP detection, right-click menu"
```

---

## Task 8: SettingsModal.vue

**Files:**
- Create: `src/components/SettingsModal.vue`

- [ ] **Step 8.1: 创建 SettingsModal.vue**

新建 `src/components/SettingsModal.vue`：

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore, FONT_OPTIONS } from '../stores/fontStore';
import {
  useShortcutsStore, keyEventToString,
  SHORTCUT_LABELS, SHORTCUT_GROUPS,
  type ShortcutAction,
} from '../stores/shortcutsStore';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const themeStore = useThemeStore();
const fontStore = useFontStore();
const shortcutsStore = useShortcutsStore();

type Tab = 'theme' | 'font' | 'shortcuts';
const activeTab = ref<Tab>('theme');

// ── Shortcut rebinding ──
const rebindingAction = ref<ShortcutAction | null>(null);
const rebindError = ref('');

function startRebind(action: ShortcutAction) {
  rebindingAction.value = action;
  rebindError.value = '';
}

function cancelRebind() {
  rebindingAction.value = null;
  rebindError.value = '';
}

function handleRebindKey(e: KeyboardEvent) {
  if (!rebindingAction.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') { cancelRebind(); return; }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const keyStr = keyEventToString(e);
  const conflict = shortcutsStore.hasConflict(keyStr);
  if (conflict && conflict !== rebindingAction.value) {
    rebindError.value = `"${keyStr}" 已被「${SHORTCUT_LABELS[conflict]}」使用`;
    return;
  }

  shortcutsStore.setKey(rebindingAction.value, keyStr);
  rebindingAction.value = null;
  rebindError.value = '';
}

function confirmReset() {
  if (confirm('重置所有快捷键为默认值？')) {
    shortcutsStore.resetAll();
  }
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (rebindingAction.value) {
    handleRebindKey(e);
    return;
  }
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-backdrop" @click="handleBackdropClick">
      <div class="settings-modal" @click.stop>
        <!-- Left nav -->
        <nav class="settings-nav">
          <div class="nav-label">SETTINGS</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'theme' }"
            @click="activeTab = 'theme'"
          >🎨 主题</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'font' }"
            @click="activeTab = 'font'"
          >🔤 字体</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'shortcuts' }"
            @click="activeTab = 'shortcuts'"
          >⌨️ 快捷键</div>
        </nav>

        <!-- Right content -->
        <div class="settings-content">

          <!-- Theme tab -->
          <div v-if="activeTab === 'theme'" class="tab-panel">
            <h2 class="panel-title">外观主题</h2>
            <div class="theme-grid">
              <div
                v-for="t in themeStore.getAllThemes()"
                :key="t.name"
                class="theme-card"
                :class="{ active: t.name === themeStore.currentName }"
                @click="themeStore.setTheme(t.name)"
              >
                <div
                  class="theme-preview"
                  :style="{
                    background: `linear-gradient(135deg, ${t.ui.bg} 50%, ${t.ui.bgLight} 50%)`
                  }"
                ></div>
                <div class="theme-info">
                  <span class="theme-name">{{ t.label }}</span>
                  <span v-if="t.name === themeStore.currentName" class="theme-check">✓</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Font tab -->
          <div v-if="activeTab === 'font'" class="tab-panel">
            <h2 class="panel-title">字体设置</h2>
            <div class="font-controls">
              <div class="control-group">
                <label class="control-label">字体</label>
                <select v-model="fontStore.fontFamily" class="control-select">
                  <option v-for="f in FONT_OPTIONS" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
              <div class="control-group">
                <label class="control-label">
                  字号 <span class="control-value">{{ fontStore.fontSize }}px</span>
                </label>
                <input
                  v-model.number="fontStore.fontSize"
                  type="range" min="8" max="24" step="1"
                  class="control-slider"
                />
                <div class="range-labels"><span>8</span><span>24</span></div>
              </div>
              <div class="control-group">
                <label class="control-label">
                  行高 <span class="control-value">{{ fontStore.lineHeight.toFixed(1) }}</span>
                </label>
                <input
                  v-model.number="fontStore.lineHeight"
                  type="range" min="1.0" max="2.0" step="0.1"
                  class="control-slider"
                />
                <div class="range-labels"><span>1.0</span><span>2.0</span></div>
              </div>
              <div
                class="font-preview"
                :style="{
                  fontFamily: `'${fontStore.fontFamily}', Consolas, monospace`,
                  fontSize: `${fontStore.fontSize}px`,
                  lineHeight: fontStore.lineHeight,
                  background: themeStore.getCurrentTheme().terminal.background,
                  color: themeStore.getCurrentTheme().terminal.foreground,
                }"
              >
                <span :style="{ color: themeStore.getCurrentTheme().terminal.green }">user</span>
                <span> ~/projects </span>
                <span :style="{ color: themeStore.getCurrentTheme().terminal.blue }">❯</span>
                <span> echo 预览 Preview 123</span>
              </div>
            </div>
          </div>

          <!-- Shortcuts tab -->
          <div v-if="activeTab === 'shortcuts'" class="tab-panel">
            <div class="shortcuts-header">
              <h2 class="panel-title">快捷键</h2>
              <button class="reset-btn" @click="confirmReset">↩ 重置默认</button>
            </div>
            <div v-if="rebindError" class="rebind-error">{{ rebindError }}</div>
            <div class="shortcuts-list">
              <template v-for="group in SHORTCUT_GROUPS" :key="group.label">
                <div class="shortcut-group-label">{{ group.label }}</div>
                <div
                  v-for="action in group.actions"
                  :key="action"
                  class="shortcut-row"
                  :class="{
                    rebinding: rebindingAction === action,
                    error: rebindingAction === action && rebindError,
                  }"
                  @click="rebindingAction === action ? cancelRebind() : startRebind(action)"
                >
                  <span class="shortcut-label">{{ SHORTCUT_LABELS[action] }}</span>
                  <span class="shortcut-key">
                    {{ rebindingAction === action ? '请按下新快捷键…' : shortcutsStore.getKey(action) }}
                  </span>
                </div>
              </template>
            </div>
          </div>

        </div>

        <!-- Close button -->
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  position: relative;
  width: 600px;
  max-width: 90vw;
  height: 420px;
  max-height: 80vh;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  display: flex;
  overflow: hidden;
  box-shadow: 0 8px 40px rgba(0, 0, 0, 0.6);
}

.settings-nav {
  width: 130px;
  background: var(--ui-bg);
  border-right: 1px solid var(--ui-border);
  padding: 16px 0;
  flex-shrink: 0;
}

.nav-label {
  padding: 0 12px 8px;
  color: var(--ui-fg-muted);
  font-size: 9px;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.nav-item {
  padding: 8px 10px;
  margin: 0 6px 2px;
  border-radius: 5px;
  color: var(--ui-fg-muted);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.nav-item:hover {
  background: var(--ui-hover);
  color: var(--ui-fg);
}

.nav-item.active {
  background: var(--ui-border);
  color: var(--ui-accent);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.modal-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--ui-fg-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
}

.modal-close:hover {
  background: var(--ui-hover);
  color: var(--ui-fg);
}

.tab-panel { display: flex; flex-direction: column; gap: 16px; }
.panel-title { font-size: 14px; font-weight: 600; color: var(--ui-fg); }

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.theme-card {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}

.theme-card:hover { border-color: var(--ui-hover); }
.theme-card.active { border-color: var(--ui-accent); border-width: 2px; }

.theme-preview { height: 50px; }
.theme-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--ui-bg);
}

.theme-name { font-size: 10px; color: var(--ui-fg); }
.theme-check { color: var(--ui-accent); font-size: 11px; }

/* Font controls */
.font-controls { display: flex; flex-direction: column; gap: 14px; }
.control-group { display: flex; flex-direction: column; gap: 6px; }
.control-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-fg-muted);
}

.control-value { color: var(--ui-accent); }

.control-select {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  color: var(--ui-fg);
  padding: 5px 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.control-slider {
  width: 100%;
  accent-color: var(--ui-accent);
  cursor: pointer;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--ui-fg-muted);
}

.font-preview {
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  font-family: 'Cascadia Code', monospace;
}

/* Shortcuts */
.shortcuts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.reset-btn {
  background: transparent;
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  color: var(--ui-fg-muted);
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
}

.reset-btn:hover { border-color: var(--ui-accent); color: var(--ui-fg); }

.rebind-error {
  background: color-mix(in srgb, #ff6b6b 15%, transparent);
  border: 1px solid #ff6b6b;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  color: #ff8585;
}

.shortcuts-list { display: flex; flex-direction: column; gap: 1px; }

.shortcut-group-label {
  font-size: 9px;
  color: var(--ui-fg-muted);
  letter-spacing: 0.5px;
  padding: 8px 6px 3px;
  text-transform: uppercase;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s;
}

.shortcut-row:hover { background: var(--ui-hover); }
.shortcut-row.rebinding { background: color-mix(in srgb, var(--ui-accent) 12%, transparent); }
.shortcut-row.error { background: color-mix(in srgb, #ff6b6b 12%, transparent); }

.shortcut-label { font-size: 12px; color: var(--ui-fg); }

.shortcut-key {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  color: var(--ui-accent);
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: nowrap;
}

.shortcut-row.rebinding .shortcut-key {
  color: var(--ui-fg-muted);
  border-style: dashed;
}
</style>
```

- [ ] **Step 8.2: 提交**

```bash
git add src/components/SettingsModal.vue
git commit -m "feat: add SettingsModal with theme/font/shortcuts tabs"
```

---

## Task 9: TabBar.vue + App.vue 接线

**Files:**
- Modify: `src/components/TabBar.vue`
- Modify: `src/App.vue`

- [ ] **Step 9.1: 修改 TabBar.vue 的设置按钮**

在 `src/components/TabBar.vue` 中，将 `showSettings` 相关的设置下拉菜单替换为派发事件。

找到这个函数（在 `<script setup>` 中）：
```typescript
function applyTheme(name: string) {
  themeStore.setTheme(name);
}
```

将其替换为：
```typescript
function openSettings() {
  window.dispatchEvent(new CustomEvent('lumiterm:open-settings'));
  dropdownOpen.value = false;
}
```

找到 template 中的 `.settings-wrapper`：
```html
<div class="settings-wrapper">
  <div class="settings-btn" :class="{ open: showSettings }" @click.stop="showSettings = !showSettings; dropdownOpen = false">⚙</div>
  <div v-if="showSettings" class="settings-dropdown" @click.stop>
    <!-- ... theme list ... -->
  </div>
</div>
```

替换为：
```html
<div class="settings-wrapper">
  <div class="settings-btn" @click.stop="openSettings()">⚙</div>
</div>
```

同时删除 `showSettings` ref 的声明（`const showSettings = ref(false);`）以及 `applyTheme` 函数，以及 `handleGlobalPointerDown` 中关闭 `showSettings` 的逻辑。

- [ ] **Step 9.2: 修改 App.vue — 引入 SettingsModal + 全局快捷键**

在 `src/App.vue` 的 `<script setup>` 中：

**添加 imports：**
```typescript
import SettingsModal from './components/SettingsModal.vue';
import { useHistoryStore } from './stores/historyStore';
import { useShortcutsStore } from './stores/shortcutsStore';
```

**添加 store 和 modal state：**
```typescript
const historyStore = useHistoryStore();
const shortcutsStore = useShortcutsStore();
const showSettings = ref(false);
```

**修改 `handleKeydown` 函数 — 在顶部加入快捷键处理：**

在现有 `handleKeydown` 函数的开头（`if (e.key === 'F2' ...)` 之前）加入：

```typescript
// shortcutsStore-managed shortcuts
if (shortcutsStore.matchesEvent('open-settings', e)) {
  e.preventDefault();
  showSettings.value = !showSettings.value;
  return;
}
if (shortcutsStore.matchesEvent('new-tab', e)) {
  e.preventDefault();
  store.createTab('powershell');
  return;
}
if (shortcutsStore.matchesEvent('close-tab', e)) {
  e.preventDefault();
  if (store.activeTabId) {
    const tab = store.tabs.find((t) => t.id === store.activeTabId);
    if (tab && confirm(`关闭 ${tab.title}？`)) {
      store.removeTab(store.activeTabId);
      if (store.tabs.length === 0) closeApp();
    }
  }
  return;
}
if (shortcutsStore.matchesEvent('next-tab', e)) {
  e.preventDefault();
  const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
  if (idx !== -1 && store.tabs.length > 1) {
    store.switchTab(store.tabs[(idx + 1) % store.tabs.length].id);
  }
  return;
}
if (shortcutsStore.matchesEvent('prev-tab', e)) {
  e.preventDefault();
  const idx = store.tabs.findIndex((t) => t.id === store.activeTabId);
  if (idx !== -1 && store.tabs.length > 1) {
    store.switchTab(store.tabs[(idx - 1 + store.tabs.length) % store.tabs.length].id);
  }
  return;
}
if (shortcutsStore.matchesEvent('copy', e)) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('lumiterm:copy'));
  return;
}
if (shortcutsStore.matchesEvent('paste', e)) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('lumiterm:paste'));
  return;
}
if (shortcutsStore.matchesEvent('cut', e)) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('lumiterm:cut'));
  return;
}
if (shortcutsStore.matchesEvent('history-search', e)) {
  e.preventDefault();
  window.dispatchEvent(new CustomEvent('lumiterm:history-search'));
  return;
}
```

**在 `onMounted` 中加入 settings 事件监听和 cleanup：**

在 `store.restoreTabs();` 之后加入：
```typescript
historyStore.cleanup();
window.addEventListener('lumiterm:open-settings', () => { showSettings.value = true; });
```

**在现有的 `handleKeydown` 中，移除已由 shortcutsStore 接管的重复判断：**

删除以下代码块（它们现在由上面的 shortcutsStore 处理）：
- `if (e.key === 't') { ... store.createTab('powershell') ... }`
- `else if (e.key === 'w') { ... store.removeTab ... }`
- `else if (e.key === 'Tab') { ... switchTab ... }`

（注意：`Ctrl+1~9` 切换、`Ctrl+Shift+D/E/W/T/N/L`、`Alt+Left/Right`、`F2` 这些保留，不影响）

- [ ] **Step 9.3: 修改 App.vue template — 加入 SettingsModal**

在 `</div>` 最后（`</template>` 之前）加入：

```html
<SettingsModal :visible="showSettings" @close="showSettings = false" />
```

- [ ] **Step 9.4: 全面验证**

```bash
npx pnpm tauri dev
```

验证清单：
- [ ] `⚙` 按钮点击 → 打开设置模态框，不再弹主题下拉
- [ ] `Ctrl+,` → 打开/关闭设置模态框
- [ ] 设置 → 主题：切换主题立即生效
- [ ] 设置 → 字体：调整字号滑块，终端字体实时变化
- [ ] 设置 → 快捷键：点击某行进入改绑状态，按下新键保存
- [ ] 快捷键冲突检测：尝试将「粘贴」改绑为已被占用的键，出现红色错误
- [ ] 「重置默认」恢复所有快捷键
- [ ] `Ctrl+T` → 新建 PowerShell tab
- [ ] `Ctrl+W` → 关闭当前 tab（confirm 对话框）
- [ ] `Ctrl+Tab` → 切换到下一个 tab
- [ ] `Ctrl+R` → 历史搜索面板
- [ ] 右键终端 → 复制/粘贴/剪切菜单，颜色跟随当前主题
- [ ] 运行 `vim` → InputBar 消失，退出后恢复

- [ ] **Step 9.5: 提交**

```bash
git add src/components/TabBar.vue src/App.vue
git commit -m "feat: wire SettingsModal into TabBar and App.vue global shortcuts"
```

---

## 完成验证

所有任务完成后，运行以下最终检查：

```bash
# 确保无 TypeScript 错误
npx pnpm vue-tsc --noEmit

# 确保 Rust 编译干净
cd src-tauri && cargo check && cd ..

# 完整构建测试
npx pnpm tauri build
```

如果构建成功，运行 `npx pnpm tauri dev` 做最终 UI 验收。
