# CLAUDE.md

本文件用于指导 Claude Code 在 LumiTerm 仓库中的协作与执行。

## 1. 项目概览（执行优先）

LumiTerm 是一个基于 **Tauri + Vue 3 + xterm.js** 的 Windows 终端应用。
当前重点已从“单终端 MVP”进入“终端 + 命令可视化增强”阶段。

当前已完成的关键增量：
- 多标签页 / 分屏 / 主题 / 快捷键增强
- 工作区与文件编辑器能力
- Command Blocks Phase 1（OSC 133 注入、解析、状态管理）
- Command Status Bar（底部状态栏方案，替代遮挡终端的 overlay）
- 命令历史显示修复（Enter 时捕获真实命令文本）

## 2. 先看哪里（关键入口）

### 前端关键文件
- `src/components/TerminalPane.vue`
  - 终端 pane 主入口
  - PTY 输出接入、OSC 事件处理、状态栏挂载
- `src/components/CommandStatusBar.vue`
  - 底部 28px 状态栏
  - 展开/收起命令历史面板
- `src/utils/oscParser.ts`
  - 解析 OSC 133 序列
  - 支持 `133;C;<command>` 的命令文本提取
- `src/stores/commandBlockStore.ts`
  - Command Block 生命周期状态（start/end/output）

### Rust 后端关键文件
- `src-tauri/src/services/pty_service.rs`
  - Shell 启动参数与 PowerShell prompt hook
  - 注入 OSC 133（A/B/C/D）
  - Enter 时通过 PSReadLine 获取真实命令并发出 `133;C;<command>`
- `src-tauri/src/commands/pty.rs`
  - Tauri 命令层
- `src-tauri/src/lib.rs`
  - 应用入口（`main.rs` 仅调用 `lib.rs::run`）

### 其他子系统（命令可视化之外）
除终端/Command Blocks 主线外，仓库还包含以下并行子系统，改动前先定位归属：
- **多标签 / 分屏**：`components/TabBar.vue`、`TerminalTab.vue`、`SplitPane.vue`，状态在 `stores/terminalStore.ts`
- **文件树 / 编辑器**：`components/SidebarPanel.vue`、`FileTreeNode.vue`、`FileEditorPane.vue`，状态在 `stores/editorStore.ts`
- **主题系统**：`themes/`（`builtin.ts` + `warp-imported.ts` 由脚本生成），状态在 `stores/themeStore.ts`；窗口为无边框透明（`tauri.conf.json`: `decorations:false` / `transparent:true`），主题需兼容玻璃效果
- **字体 / 快捷键**：`stores/fontStore.ts`、`stores/shortcutsStore.ts`
- **通用 UI**：`components/Toast.vue`、`ConfirmDialog.vue` 及对应 `utils/toast.ts`、`utils/confirm.ts`

## 3. 开发命令（默认用 RTK）

> 在本仓库执行命令时，优先使用 `rtk` 前缀。

```bash
# 安装依赖
rtk pnpm install

# 启动开发（Tauri 会先跑 npm run dev 起 vite:1420，再拉起 Rust 壳）
rtk pnpm tauri dev

# 前端测试（命令可视化重点子集）
rtk pnpm exec vitest run src/utils/oscParser.test.ts src/stores/commandBlockStore.test.ts

# 前端全部测试
rtk pnpm exec vitest run

# 类型检查门禁（无 ESLint；build 前会跑 vue-tsc --noEmit）
rtk pnpm build      # == vue-tsc --noEmit && vite build

# Rust 测试（示例，crate 名为 lumi-term）
rtk cargo test -p lumi-term powershell_args_include_osc133_prompt_hook

# 重新导入 Warp 主题（生成 src/themes/warp-imported.ts，勿手改该文件）
rtk pnpm run import-themes

# 构建安装包
rtk pnpm tauri build
```

> 注：无独立 lint 步骤，类型安全靠 `vue-tsc --noEmit`（即 `pnpm build` 的前半段）保证。测试框架为 Vitest（jsdom），非 Jest。
>
> ⚠️ pnpm 已全局安装（见 PATH），直接用 `pnpm ...`，**不要写 `npx pnpm ...`**——npx 会把 `pnpm` 当成 npm script 去找，报 `Missing script: "pnpm"` 导致命令失败。

## 4. 运行机制（精简架构）

```text
Frontend (Vue + xterm.js)
  -> Tauri Channel
Rust PTY Service
  -> Windows ConPTY
Shell (PowerShell/CMD/WSL2)
```

Command Blocks 关键链路：
1. 后端在 PowerShell prompt/enter/exit 注入 OSC 133 事件
2. 前端 `oscParser` 解析事件并剥离控制序列
3. `commandBlockStore` 维护命令生命周期
4. `CommandStatusBar` 展示最近命令与历史面板

## 5. Command Blocks 当前状态（重要）

### 已实现
- OSC 133 A/B/C/D 注入与解析
- 每条命令的状态跟踪（running/success/error）
- 底部状态栏 + 历史面板
- 命令历史显示真实命令（不再出现“空命令/路径片段”）

### 已知边界
- 目前命令边界与真实命令捕获优先面向 PowerShell
- 历史面板当前展示命令/状态/耗时，不展示完整输出
- 大量历史记录场景尚未做虚拟滚动优化

## 6. 修改时的硬约束

1. **小步、外科手术式修改**：只改与目标相关的文件和逻辑。
2. **先测后报**：涉及行为变更，至少跑相关最小测试集。
3. **不要恢复遮挡式 overlay**：命令展示走状态栏方案。
4. **命令来源不要再回退到 xterm 当前行猜测**：优先使用 `OSC 133;C;<command>`。
5. **保持中文可用性**：修改后可用 `echo 你好世界` 快测编码链路。

## 7. 常用排查清单

### 命令历史异常（空命令/错命令）
- 检查 `pty_service.rs` 是否仍发送 `133;C;<command>`
- 检查 `oscParser.ts` 是否解析 `C;` payload 到 `event.command`
- 检查 `TerminalPane.vue` 是否在 `exec_start` 使用 `event.command`

### 状态栏不显示
- 检查 `TerminalPane.vue` 是否挂载 `CommandStatusBar`
- 检查 `commandBlockStore` 是否有该 pane 的 block 数据
- 检查 `.terminal-container` 与状态栏布局（底部 28px 预留）

### PTY/终端问题
- 检查 `src-tauri/src/services/pty_service.rs` 的 reader/writer 线程逻辑
- 检查 shell 启动参数和编码设置

## 8. 协作约定

- 计划、设计、复盘文档放在：`docs/superpowers/`
- 重要设计先写 spec，再落实现（避免直接开改）
- 提交尽量按功能链路拆分，提交信息聚焦“为什么”

---

如果你是新开会话的 Claude：先读本文件，再读 `src/components/TerminalPane.vue` 与 `src-tauri/src/services/pty_service.rs`，再开始改动。