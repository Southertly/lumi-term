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
  - 应用入口

## 3. 开发命令（默认用 RTK）

> 在本仓库执行命令时，优先使用 `rtk` 前缀。

```bash
# 安装依赖
rtk npx pnpm install

# 启动开发
rtk npx pnpm tauri dev

# 前端测试（重点）
rtk npx vitest run src/utils/oscParser.test.ts src/stores/commandBlockStore.test.ts

# Rust 测试（示例）
rtk cargo test -p lumi-term powershell_args_include_osc133_prompt_hook

# 构建
rtk npx pnpm tauri build
```

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