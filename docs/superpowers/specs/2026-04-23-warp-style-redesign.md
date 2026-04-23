# LumiTerm Warp 风格改造 — 设计规格

**日期:** 2026-04-23  
**状态:** 已批准  
**方案:** B · 底部输入栏分离 + Warp Dark 主题

---

## 目标

将 LumiTerm 的 UI 改造为 Warp 风格：固定在底部的独立命令输入栏、新 Warp Dark 配色主题、交互式程序自动全屏。xterm.js PTY 渲染架构保持不变。

---

## 范围

**包含:**
- 新增 `Warp Dark` 主题，设为默认
- 新增 `InputBar.vue` 组件（底部固定输入栏）
- `TerminalPane.vue` 集成 InputBar，处理交互式模式检测
- `themeStore.ts` 加入 Warp Dark 主题定义
- Tab bar 视觉小幅优化（间距、圆角对齐新主题）

**不包含:**
- Block 化输出（每条命令输出包在独立卡片里）—— 留待后续
- 命令自动补全
- OSC 7 目录追踪以外的 shell 集成

---

## 架构

```
TerminalPane.vue
├── xterm.js terminal (flex: 1, 占满剩余高度)
└── InputBar.vue (height: ~52px, position: 底部)
    ├── 目录行: ~/path  |  branch
    └── 输入行: ❯  [textarea]  ↑↓历史 ⌅发送
```

交互式模式下：

```
TerminalPane.vue
└── xterm.js terminal (height: 100%, InputBar 隐藏)
```

---

## 组件设计

### InputBar.vue

**Props:**
- `terminalId: string` — 对应的 PTY 实例 ID
- `isInteractive: boolean` — 是否处于交互式模式（控制显示/隐藏）
- `cwd: string` — 当前工作目录（由 TerminalPane 解析 OSC 7 后传入）
- `gitBranch: string` — git 分支名（由 TerminalPane 调用 Tauri 命令后传入，可为空）

**内部状态:**
- `inputValue: string` — 当前输入内容
- `history: string[]` — 命令历史数组（最多 500 条，存 localStorage）
- `historyIndex: number` — 当前历史导航位置

**行为:**
- `Enter` → 调用 `write_to_pty(terminalId, inputValue + "\n")`，清空输入，追加到历史
- `↑` / `↓` → 历史导航
- `isInteractive = true` 时：`height: 0; overflow: hidden`，配合 `transition: height 0.15s ease`
- `isInteractive = false` 时：`height: 52px`

**布局（固定高度 52px）:**
```
┌─────────────────────────────────────────────────────┐
│  ~/projects/lumi-term  |  master           (10px)   │
│  ❯  [                            ]  ↑↓ ⌅  (34px)   │
│                                            (8px)    │
└─────────────────────────────────────────────────────┘
```

---

### TerminalPane.vue 修改

**新增状态:**
- `isInteractiveMode: boolean = false`
- `cwd: string = ''`
- `gitBranch: string = ''`

**交互式模式检测:**

在 `xtermInitializer.ts` 初始化 xterm.js 时，通过 `terminal.parser.registerDcsHandler` 无法覆盖此场景，改用以下方式：在 PTY `onData` 回调中，将原始字节先扫描控制序列，再写入 `terminal.write(data)`：

- 检测到 `\x1b[?1049h`（SMCUP）→ 触发回调，TerminalPane 设 `isInteractiveMode = true`
- 检测到 `\x1b[?1049l`（RMCUP）→ 触发回调，TerminalPane 设 `isInteractiveMode = false`

扫描不解析完整 CSI，仅做字符串包含检测（`data.includes('\x1b[?1049h')`），足够准确且性能无影响。

**目录追踪（OSC 7）:**

监听 PTY 输出中的 `\x1b]7;file://hostname/path\x07` 序列：
- 解析 path 部分，更新 `cwd`
- 将 `cwd` 作为 prop 传给 InputBar

**git 分支:**

`cwd` 变化时，调用 Tauri 命令 `get_git_branch(cwd)` 获取当前分支名（异步，失败时为空字符串）。

**xterm.js 高度调整:**

InputBar 显示/隐藏后（transition 结束），调用 `fitAddon.fit()` 重新计算终端行列数并通知 PTY resize。

---

## Warp Dark 主题

在 `themeStore.ts` 新增，并设为默认主题（替换 `catppuccin-mocha`）：

| CSS 变量 | 值 | 用途 |
|---|---|---|
| `--ui-bg` | `#111113` | Titlebar、TabBar 背景 |
| `--ui-bg-light` | `#1c1c1e` | 终端区域背景、非活跃 tab |
| `--ui-bg-lighter` | `#252528` | InputBar 背景、hover 态 |
| `--ui-fg` | `#e8e8e8` | 主文字 |
| `--ui-fg-muted` | `#6e6e73` | 次级文字、提示 |
| `--ui-accent` | `#5b9cf6` | 活跃 tab、提示符 `❯`、光标 |
| `--ui-border` | `#2a2a2e` | 分隔线、边框 |
| `--ui-hover` | `#3a3a3e` | hover 边框色 |

**xterm.js 终端配色（TerminalTheme）:**

```ts
{
  background: '#1c1c1e',
  foreground: '#e8e8e8',
  cursor: '#5b9cf6',
  cursorAccent: '#1c1c1e',
  black: '#1c1c1e',   bright: '#6e6e73',
  red: '#ff6b6b',     brightRed: '#ff8585',
  green: '#a6e3a1',   brightGreen: '#b8f0b3',
  yellow: '#ffd93d',  brightYellow: '#ffe066',
  blue: '#5b9cf6',    brightBlue: '#7db3ff',
  magenta: '#c792ea', brightMagenta: '#d4a8f5',
  cyan: '#89ddff',    brightCyan: '#a3e8ff',
  white: '#c8c8c8',   brightWhite: '#ffffff',
}
```

---

## Rust 后端新增命令

`src-tauri/src/commands/` 新增：

```rust
#[tauri::command]
async fn get_git_branch(path: String) -> Result<String, String>
```

实现：在 `path` 目录下执行 `git rev-parse --abbrev-ref HEAD`，返回分支名或空字符串（不抛错）。

---

## 文件变更清单

| 文件 | 操作 |
|---|---|
| `src/components/InputBar.vue` | **新建** |
| `src/components/TerminalPane.vue` | 修改：集成 InputBar、交互式模式检测、OSC 7 解析、fit 联动 |
| `src/stores/themeStore.ts` | 修改：加入 Warp Dark，改为默认 |
| `src/components/TabBar.vue` | 小改：间距/圆角微调（可选） |
| `src-tauri/src/commands/pty.rs` | 修改：新增 `get_git_branch` 命令 |
| `src-tauri/src/lib.rs` | 修改：注册新 Tauri 命令 |

---

## 边界情况

| 场景 | 处理方式 |
|---|---|
| 无 git 仓库目录 | `gitBranch` 为空，分支 chip 不显示 |
| git 命令超时 | 500ms 超时后视为无分支，不阻塞 UI |
| Shell 不支持 OSC 7 | `cwd` 保持空字符串，目录显示空白（不崩溃） |
| SplitPane 下多个 Pane | 每个 `TerminalPane` 有独立的 InputBar 和 `isInteractiveMode` 状态 |
| InputBar 隐藏时键盘输入 | 所有键盘事件直通 xterm.js（InputBar `display:none` 不拦截） |
| 窗口 resize | fitAddon.fit() 已在现有逻辑中处理，无需额外改动 |

---

## 不做的事

- 不实现命令自动补全（留后续）
- 不实现 Block 化输出（留后续）
- 不修改 PTY 读写线程（Rust 端无需改动，除 `get_git_branch`）
- 不移除现有 5 个主题
