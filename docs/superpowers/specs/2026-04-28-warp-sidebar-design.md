# LumiTerm Warp 左侧 Sidebar 功能设计

**日期:** 2026-04-28  
**状态:** 已确认，待实现  
**分支:** `feat/sidebar-panel`（实现前创建隔离 worktree）

## 目标

为 LumiTerm 增加 Warp 风格的左侧可折叠 Sidebar，用于按工作目录管理和切换终端 sessions。第一阶段保留现有顶部标签栏，Sidebar 作为新增导航层，不重写已有终端、标签、分屏和 PTY 生命周期。

## 范围

**包含:**
- 新增左侧 `SidebarPanel.vue`。
- Sidebar 顶部显示当前 workspace/工作目录入口。
- Sidebar session 列表默认显示当前 workspace 下的 tabs。
- Sidebar 支持展开/折叠：展开显示完整信息，折叠显示图标小标签。
- 新建 session 时使用当前 workspace 作为默认启动目录。
- 每个 tab/session 持久化绑定的 `cwd`。
- 顶部 `TabBar` 第一阶段继续保留，后续用户要求时再移除或弱化。

**不包含:**
- 第一阶段不删除顶部标签栏。
- 不实现完整 Warp Blocks 输出。
- 不做多窗口 workspace 管理。
- 不改变分屏模型，只复用现有 tab/pane 能力。

## 布局设计

`App.vue` 从当前的纵向布局改为 titlebar 下方的左右布局：

```text
App.vue
├─ titlebar
└─ main-layout
   ├─ SidebarPanel.vue
   └─ content-layout
      ├─ TabBar.vue              # 第一阶段保留
      └─ terminal-wrapper
         └─ TerminalTab.vue[]    # 现有 terminal/pane 生命周期不变
```

Sidebar 展开宽度建议约 `240-280px`，折叠宽度约 `52-64px`。折叠状态只影响 UI 呈现，不改变 tabs、panes、PTY sessions。

## 组件边界

### SidebarPanel.vue

职责：
- 显示当前 workspace。
- 显示当前 workspace 下的 session 列表。
- 创建、切换、关闭 session。
- 控制折叠/展开。

不负责：
- 不直接创建或关闭 PTY。
- 不直接管理 xterm.js 实例。
- 不替代 `TerminalTab.vue` / `TerminalPane.vue` 的生命周期职责。

Sidebar 的操作全部通过 `terminalStore`：
- `switchTab(tab.id)` 切换 session。
- `createTab(shellType, title, cwd)` 新建 session。
- `removeTab(tab.id)` 关闭 session，继续复用现有 PTY cleanup。

### TabBar.vue

第一阶段保留现有功能：
- 顶部标签切换、关闭、新建。
- 拖拽排序、重命名、颜色、分屏入口。

它与 Sidebar 使用同一份 store 状态，因此任一入口切换 active tab 后，另一入口同步高亮。

## Store 设计

在 `terminalStore.ts` 扩展现有数据模型。

### Tab 扩展

```ts
export interface Tab {
  id: string;
  title: string;
  shellType: ShellType;
  sessionId: string | null;
  color?: string;
  cwd?: string;
  panes: Pane[];
  splitDirection: 'horizontal' | 'vertical' | null;
  activePaneId: string | null;
}
```

`cwd` 表示该 session 的工作目录，用于 Sidebar 分组/过滤和新建 session 默认目录。

### Workspace 状态

```ts
const currentWorkspacePath = ref<string | null>(null);
const recentWorkspacePaths = ref<string[]>([]);
const sidebarCollapsed = ref(false);
```

建议新增方法：

```ts
function setCurrentWorkspace(path: string): void;
function createTab(shellType?: ShellType, title?: string, cwd?: string): string;
function getTabsForCurrentWorkspace(): Tab[];
function setSidebarCollapsed(collapsed: boolean): void;
function toggleSidebarCollapsed(): void;
```

`createTab` 的 `cwd` 参数可选；未传时使用 `currentWorkspacePath`。旧调用不需要一次性全部改完。

## 数据流

### 切换 workspace

```text
用户点击 workspace 入口
→ 选择/输入目录
→ store.setCurrentWorkspace(path)
→ recentWorkspacePaths 更新
→ Sidebar session 列表过滤为该 cwd 下的 tabs
```

切换 workspace 只改变 Sidebar 列表显示，不关闭其他目录下的 sessions。

### 新建 session

```text
用户点击 Sidebar New
→ store.createTab(shellType, title, currentWorkspacePath)
→ TerminalPane 创建 PTY 时使用 tab.cwd 作为启动目录
→ 新 tab 成为 activeTabId
→ Sidebar 与 TabBar 同步高亮
```

后端已有 PTY 创建命令需要支持可选 `cwd`；如果当前命令还不支持，需要扩展 Tauri command 和 `pty_service` 的 spawn 参数。

### 切换 session

```text
用户点击 Sidebar session
→ store.switchTab(tab.id)
→ 右侧 TerminalTab 显示对应终端
→ 顶部 TabBar 高亮同步更新
```

### 关闭 session

```text
用户点击 Sidebar close
→ 确认关闭
→ store.removeTab(tab.id)
→ 现有 TerminalPane unmount
→ close_pty_cmd 释放 PTY
```

## 持久化

扩展现有 `lumiterm_tabs` localStorage 数据：
- tab `cwd`
- `currentWorkspacePath`
- `recentWorkspacePaths`
- `sidebarCollapsed`

旧数据没有 `cwd` 时：
- 如果 `currentWorkspacePath` 存在，旧 tab 归到当前 workspace。
- 否则使用最近工作目录或默认启动目录。

## 错误处理

- workspace 路径不可用或目录选择失败时，保持当前 workspace 不变。
- 新建 session 的 cwd 无效时，在终端显示启动失败信息，不影响其他 session。
- 旧持久化数据缺少 `cwd` 时自动归入当前/默认 workspace，不阻塞恢复。
- Sidebar 折叠/展开只改 UI 状态，不触发终端销毁。

## UI 行为

### 展开状态

展示：
- 当前 workspace 名称和路径。
- session 标题。
- shell 图标。
- 运行目录/状态摘要。
- 分屏指示。
- 关闭按钮。
- 新建 session 按钮。
- 折叠按钮。

### 折叠状态

展示：
- workspace 图标入口。
- session 图标小标签。
- active session 高亮。
- 运行状态点。
- 新建按钮。
- 展开按钮。

折叠时悬停可显示 session 标题和 cwd。

## 验证计划

手动验证：
1. 启动应用，确认顶部标签仍可用。
2. 展开/折叠 Sidebar，终端输入输出不受影响。
3. 在 Sidebar 新建 PowerShell/CMD/WSL2 session。
4. 切换 Sidebar session，右侧终端和顶部标签同步切换。
5. 切换 workspace，只过滤 Sidebar 列表，不杀掉其他 workspace 的进程。
6. 从某个 workspace 新建 session，确认 shell 启动目录正确。
7. 关闭 Sidebar session，确认 PTY 进程释放。
8. 重启应用，确认 workspace、session cwd、折叠状态恢复。
9. 验证分屏 tab 在 Sidebar 中有指示，切换后分屏状态保持。

自动验证：
- TypeScript 类型检查。
- Rust 编译检查。
- 如现有项目提供测试脚本，运行对应测试。

## 后续阶段

用户后续明确要求后，再考虑：
- 移除或弱化顶部 `TabBar`。
- 将 Sidebar session 列表升级为唯一标签入口。
- 增加更接近 Warp 的 blocks/command palette/session search。
