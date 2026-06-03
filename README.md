# LumiTerm

<div align="center">

**现代化的 Windows 终端模拟器**

基于 Tauri + Vue 3 + xterm.js 构建

[功能特性](#功能特性) • [快速开始](#快速开始) • [开发](#开发) • [架构](#架构)

</div>

---

## 功能特性

### 🎯 核心能力
- **多标签页与分屏** - 水平/垂直分屏,拖拽调整大小
- **Command Blocks** - 基于 OSC 133 的命令历史追踪与状态显示
- **工作区面板** - 文件浏览与内置代码编辑器
- **主题系统** - 内置多款主题,支持导入 Warp 主题配置

### 💎 体验增强
- **原生窗口装饰** - 无边框窗口 + 毛玻璃效果
- **快捷键** - 丰富的键盘快捷键支持(新建/关闭标签页、分屏、切换面板)
- **命令状态栏** - 底部非遮挡式命令历史与状态展示
- **PowerShell 集成** - 优先支持 PowerShell,自动注入 OSC 133 序列

### 🔧 技术栈
- **前端**: Vue 3 (Composition API) + TypeScript + Vite
- **终端**: xterm.js 6.x + WebGL 渲染
- **后端**: Rust + Tauri 2.x + portable-pty
- **状态管理**: Pinia
- **测试**: Vitest + Vue Test Utils

---

## 快速开始

### 前置要求
- Node.js 18+
- pnpm
- Rust 1.70+
- Windows 10/11

### 安装依赖
```bash
pnpm install
```

### 开发模式
```bash
pnpm tauri dev
```

### 构建
```bash
pnpm tauri build
```

构建产物位于 `src-tauri/target/release/`。

---

## 开发

### 项目结构
```
lumi-term/
├── src/                      # Vue 前端代码
│   ├── components/           # UI 组件
│   │   ├── TerminalPane.vue  # 终端面板(xterm.js 集成)
│   │   ├── CommandStatusBar.vue  # 底部命令状态栏
│   │   ├── SidebarPanel.vue  # 侧边栏(工作区/文件树)
│   │   └── ...
│   ├── stores/               # Pinia 状态管理
│   │   ├── terminalStore.ts  # 终端 pane/tab 状态
│   │   ├── commandBlockStore.ts  # 命令历史/状态
│   │   ├── themeStore.ts     # 主题配置
│   │   └── editorStore.ts    # 文件编辑器状态
│   ├── themes/               # 主题定义
│   ├── utils/
│   │   └── oscParser.ts      # OSC 133 序列解析器
│   └── main.ts
├── src-tauri/                # Rust 后端代码
│   ├── src/
│   │   ├── commands/         # Tauri 命令层
│   │   │   └── pty.rs        # PTY 相关命令
│   │   ├── services/
│   │   │   └── pty_service.rs  # PTY 核心服务(ConPTY 集成)
│   │   └── main.rs
│   ├── Cargo.toml
│   └── tauri.conf.json
└── docs/                     # 设计文档与计划
```

### 运行测试
```bash
# 前端单元测试
pnpm test:run

# Rust 测试
cd src-tauri && cargo test
```

### 命令块(Command Blocks)
LumiTerm 通过 **OSC 133 序列**追踪命令生命周期:
- `OSC 133;A` - Prompt 开始
- `OSC 133;B` - Prompt 结束
- `OSC 133;C;<command>` - 命令执行开始(包含命令文本)
- `OSC 133;D;<exit_code>` - 命令执行结束

底部状态栏实时显示最近命令的状态(运行中/成功/失败)与耗时,点击可展开完整历史面板。

---

## 架构

### 技术架构
```
┌─────────────────────────────────────────┐
│  Vue 3 + xterm.js (Frontend)           │
│  - TerminalPane (xterm 实例管理)       │
│  - CommandStatusBar (命令历史)         │
│  - SidebarPanel (工作区/文件树)        │
└──────────────┬──────────────────────────┘
               │ Tauri IPC
┌──────────────▼──────────────────────────┐
│  Rust Backend (src-tauri)               │
│  - PTY Service (portable-pty)           │
│  - OSC 133 注入(PowerShell prompt hook) │
│  - ConPTY 适配                          │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  Windows ConPTY                         │
│  - PowerShell / CMD / WSL2              │
└─────────────────────────────────────────┘
```

### 核心流程
1. **PTY 启动**: Rust 后端通过 `portable-pty` 创建 ConPTY 实例,为 PowerShell 注入 OSC 133 prompt hook
2. **输出流**: Shell 输出通过 Tauri 事件流式传递给前端,xterm.js 渲染
3. **OSC 解析**: `oscParser.ts` 从 PTY 输出中提取 OSC 133 事件,移除控制序列后传给 xterm
4. **状态管理**: `commandBlockStore` 维护每条命令的生命周期(start/end/exit_code),驱动状态栏 UI

---

## 贡献

欢迎贡献代码、报告 Bug 或提出功能建议!

### 开发约定
- 遵循 [CLAUDE.md](./CLAUDE.md) 中的项目规范
- 小步提交,每个提交聚焦一个功能点
- 修改前跑相关测试(前端 `pnpm test:run`,Rust `cargo test`)
- 命令展示走底部状态栏,不要恢复遮挡式 overlay

---

## 许可证

MIT License

---

## 致谢

- [Tauri](https://tauri.app/) - 跨平台桌面应用框架
- [xterm.js](https://xtermjs.org/) - 强大的终端模拟器
- [portable-pty](https://github.com/wez/wezterm/tree/main/pty) - 跨平台 PTY 抽象
