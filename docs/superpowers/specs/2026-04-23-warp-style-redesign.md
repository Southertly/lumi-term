# LumiTerm Warp 风格改造 — 设计规格

**日期:** 2026-04-23  
**状态:** 已批准  
**方案:** B · 底部输入栏分离 + Warp Dark 主题 + Frecency 历史命令

---

## 目标

将 LumiTerm 的 UI 改造为 Warp 风格：固定在底部的独立命令输入栏、新 Warp Dark 配色主题、交互式程序自动全屏、Frecency 历史命令系统。xterm.js PTY 渲染架构保持不变。

---

## 范围

**包含:**
- 新增 `Warp Dark` 主题，设为默认
- 新增 `InputBar.vue` 组件（底部固定输入栏）
- 新增 `HistorySearch.vue` 组件（`Ctrl+R` 模糊搜索浮层）
- 新增 `historyStore.ts`（Frecency 历史管理）
- 新增 `SettingsModal.vue` 组件（居中模态框，含主题/字体/快捷键三个分页）
- 新增 `shortcutsStore.ts`（自定义快捷键持久化）
- `TerminalPane.vue` 集成 InputBar，处理交互式模式检测，添加右键上下文菜单
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
├── HistorySearch.vue (绝对定位浮层，Ctrl+R 唤起)
└── InputBar.vue (height: ~52px, position: 底部)
    ├── 目录行: ~/path  |  branch
    └── 输入行: ❯  [textarea]  ↑↓历史 ⌅发送

historyStore.ts (Pinia，全标签页共享历史)
```

交互式模式下：

```
TerminalPane.vue
└── xterm.js terminal (height: 100%, InputBar + HistorySearch 均隐藏)
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
- `historyIndex: number` — ↑↓ 导航时在历史列表中的位置（-1 = 未导航）
- `showHistorySearch: boolean` — HistorySearch 浮层是否可见

**行为:**
- `Enter` → 调用 `write_to_pty(terminalId, inputValue + "\n")`，清空输入，调用 `historyStore.add(inputValue)`
- `↑` → historyIndex--，填入对应历史命令；`↓` → historyIndex++
- `Ctrl+R` → `showHistorySearch = true`，聚焦 HistorySearch 搜索框
- HistorySearch 选中条目后 → 填入 `inputValue`，`showHistorySearch = false`
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

### HistorySearch.vue

绝对定位浮层，紧贴 InputBar 上方弹出。

**Props:**
- `visible: boolean`

**Emits:**
- `select(command: string)` — 用户选中一条历史
- `close` — ESC 或点击外部关闭

**内部状态:**
- `query: string` — 搜索关键词
- `results: HistoryEntry[]` — 过滤后结果（最多显示 8 条）
- `selectedIndex: number` — 键盘高亮位置

**数据来源:** `historyStore.search(query)` — 返回按 score 降序排列的匹配项

**行为:**
- 打开时自动聚焦搜索框，清空 query
- 实时过滤：query 变化时调用 `historyStore.search(query)`
- `↑` / `↓` → 移动 selectedIndex
- `Enter` → emit `select(results[selectedIndex].command)`
- `ESC` → emit `close`
- 点击条目 → emit `select`

**布局:**
```
┌─────────────────────────────────────────────────┐
│  🔍 [搜索框                         ]  ESC 关闭  │
├─────────────────────────────────────────────────┤
│ ▶  git push origin master          2 min ago    │ ← 选中高亮
│    npx pnpm tauri dev              1 hour ago   │
│    git status                      3 hours ago  │
│    ...                                          │
└─────────────────────────────────────────────────┘
```

---

### historyStore.ts（新建 Pinia Store）

**数据结构:**

```ts
interface HistoryEntry {
  command: string   // 去重 key
  useCount: number  // 使用次数
  lastUsedAt: number // Unix timestamp (ms)
}
```

存储：`localStorage` key `lumiterm_history_v2`，JSON 序列化。

**Frecency 分数公式:**

```ts
function score(entry: HistoryEntry): number {
  const daysSince = (Date.now() - entry.lastUsedAt) / 86_400_000
  return entry.useCount / Math.log(daysSince + 2)
}
```

**API:**

| 方法 | 说明 |
|---|---|
| `add(command)` | 命令已存在则 useCount++、更新 lastUsedAt；否则新增 entry。触发 cleanup。 |
| `search(query)` | 过滤包含 query 的条目（大小写不敏感），按 score 降序返回，最多 50 条 |
| `list()` | 返回按 lastUsedAt 降序的全部条目（供 ↑↓ 导航用） |
| `cleanup()` | 计算所有 entry 的 score，删除低于阈值的，保留最多 1000 条 |

**Cleanup 阈值:** `score < 0.05`（约等于：使用 1 次、30 天以上未用的命令）

**何时 cleanup:** 每次 `add()` 调用后，若总条目数 > 1000 则触发；另在应用启动时触发一次。

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

## 设置面板

### SettingsModal.vue

居中模态框，`Teleport` 到 `<body>` 顶层渲染。背景遮罩（`rgba(0,0,0,0.5)`），点击遮罩或按 `ESC` 关闭。

**触发方式:** TabBar 的 ⚙ 按钮（替换现有主题下拉菜单）。

**布局:**
```
┌──────────────────────────────────────────────┐
│  左侧导航 120px  │  右侧内容区（flex:1）        │
│                  │                            │
│  SETTINGS        │  [当前分页内容]              │
│  🎨 主题  ←活跃  │                            │
│  🔤 字体         │                            │
│  ⌨️ 快捷键       │                            │
└──────────────────────────────────────────────┘
```

**三个分页:**

---

#### 主题分页

6个主题卡片网格（2行×3列）。每张卡片展示主题双色预览（`background` 和 `ui-bg-light` 的对角渐变），当前激活主题显示蓝色边框和 ✓ 标记。点击立即切换（调用 `themeStore.setTheme()`）。

---

#### 字体分页

| 控件 | 说明 |
|---|---|
| 字体下拉 | 选项：Cascadia Code（默认）、JetBrains Mono、Fira Code、Consolas、SF Mono、Source Code Pro |
| 字号滑块 | 范围 8–24px，默认 13，步长 1 |
| 行高滑块 | 范围 1.0–2.0，默认 1.2，步长 0.1 |
| 预览区 | 实时渲染终端字体效果，使用当前主题配色 |

设置存入 `localStorage` key `lumiterm_font`。xterm.js 字体设置通过 `terminal.options.fontFamily/fontSize/lineHeight` 实时更新，无需重启。

---

#### 快捷键分页

分组展示所有可绑定快捷键，每行点击进入「等待按键」状态：

**默认快捷键表:**

| 分组 | 操作 | 默认按键 |
|---|---|---|
| 编辑 | 复制 | `Ctrl+C` |
| 编辑 | 粘贴 | `Ctrl+V` |
| 编辑 | 剪切 | `Ctrl+X` |
| 标签页 | 新建标签页 | `Ctrl+T` |
| 标签页 | 关闭标签页 | `Ctrl+W` |
| 标签页 | 切换到下一个 | `Ctrl+Tab` |
| 标签页 | 切换到上一个 | `Ctrl+Shift+Tab` |
| 历史 | 搜索历史命令 | `Ctrl+R` |
| 设置 | 打开设置 | `Ctrl+,` |

**改绑流程:**
1. 点击某行 → 该行变蓝色高亮，显示「请按下新快捷键…」
2. 用户按下按键组合 → 检测是否与其他快捷键冲突
3. 冲突 → 行变红，显示冲突提示，不保存
4. 无冲突 → 立即保存，恢复正常显示
5. 按 `ESC` → 取消改绑

**「重置默认」按钮:** 恢复所有快捷键为上表默认值，弹出确认提示。

---

### shortcutsStore.ts（新建 Pinia Store）

```ts
interface ShortcutBinding {
  action: string      // 操作 ID，如 'copy'、'new-tab'
  key: string         // 如 'Ctrl+C'
  isDefault: boolean
}
```

存储：`localStorage` key `lumiterm_shortcuts`。

**API:**

| 方法 | 说明 |
|---|---|
| `getKey(action)` | 返回当前绑定的按键字符串 |
| `setKey(action, key)` | 检测冲突后更新绑定 |
| `hasConflict(key)` | 返回已使用该按键的 action，或 null |
| `resetAll()` | 恢复所有默认绑定 |

**快捷键拦截:** 在 `App.vue` 的 `keydown` 事件监听中，根据 `shortcutsStore` 动态匹配并执行对应操作。复制/粘贴/剪切在终端内通过 xterm.js selection API 实现（`terminal.getSelection()` / `terminal.paste()`）。

---

### 终端右键上下文菜单

在 `TerminalPane.vue` 中监听 xterm.js 的 `onContextMenu` 事件（或 DOM `contextmenu` 事件），阻止系统默认菜单，显示自定义菜单：

```
┌─────────────────┐
│  复制    Ctrl+C  │  ← 有选中文字时可用，否则置灰
│  粘贴    Ctrl+V  │
│  剪切    Ctrl+X  │  ← 有选中文字时可用，否则置灰
└─────────────────┘
```

菜单使用 CSS 变量配色（修复现有右键菜单硬编码浅色的问题）。菜单位置跟随鼠标坐标，超出窗口边界时自动翻转。

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
| `src/components/HistorySearch.vue` | **新建** |
| `src/components/SettingsModal.vue` | **新建** |
| `src/stores/historyStore.ts` | **新建** |
| `src/stores/shortcutsStore.ts` | **新建** |
| `src/components/TerminalPane.vue` | 修改：集成 InputBar、HistorySearch、交互式模式检测、OSC 7 解析、fit 联动、右键菜单 |
| `src/stores/themeStore.ts` | 修改：加入 Warp Dark，改为默认 |
| `src/components/TabBar.vue` | 修改：⚙ 按钮改为打开 SettingsModal；间距/圆角微调 |
| `src/App.vue` | 修改：全局 keydown 监听（shortcutsStore）；启动时 `historyStore.cleanup()` |
| `src-tauri/src/commands/pty.rs` | 修改：新增 `get_git_branch` 命令 |
| `src-tauri/src/lib.rs` | 修改：注册新 Tauri 命令 |

---

## 边界情况

| 场景 | 处理方式 |
|---|---|
| 无 git 仓库目录 | `gitBranch` 为空，分支 chip 不显示 |
| git 命令超时 | 500ms 超时后视为无分支，不阻塞 UI |
| Shell 不支持 OSC 7 | `cwd` 保持空字符串，目录显示空白（不崩溃） |
| SplitPane 下多个 Pane | 每个 `TerminalPane` 有独立的 InputBar/HistorySearch 和 `isInteractiveMode` 状态；historyStore 全局共享 |
| InputBar 隐藏时键盘输入 | 所有键盘事件直通 xterm.js（InputBar `display:none` 不拦截） |
| 窗口 resize | fitAddon.fit() 已在现有逻辑中处理，无需额外改动 |
| HistorySearch 打开时 Ctrl+R | 关闭 HistorySearch（toggle） |
| 历史为空时按 ↑ | 无操作，inputValue 不变 |
| 相同命令连续执行 | historyStore.add 幂等：只更新 useCount 和 lastUsedAt，不新增重复条目 |
| localStorage 不可用 | historyStore/shortcutsStore 降级为内存存储，不崩溃 |
| 快捷键冲突 | 行变红显示提示，不保存，用户需选择其他按键 |
| 改绑复制/粘贴/剪切后右键菜单 | 右键菜单始终显示当前绑定的按键（从 shortcutsStore 读取） |
| 无文字选中时复制/剪切 | 操作静默无效（不报错） |
| 设置模态框打开时 Ctrl+, | 关闭模态框（toggle） |
| 字体在系统中未安装 | xterm.js 自动 fallback 到 Consolas，字体下拉对应项加「(未安装)」提示 |

---

## 不做的事

- 不实现命令自动补全（留后续）
- 不实现 Block 化输出（留后续）
- 不修改 PTY 读写线程（Rust 端无需改动，除 `get_git_branch`）
- 不移除现有 5 个主题
- 历史不跨设备同步（本地 localStorage 存储）
- 历史搜索不做语义/AI 搜索，仅字符串包含匹配
- 快捷键不支持多键序列（chord），只支持单次组合键
- 不支持鼠标手势或触控板手势
