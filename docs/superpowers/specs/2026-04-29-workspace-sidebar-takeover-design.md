# LumiTerm 工作台侧边栏接管设计

## 背景

LumiTerm 当前是一个 Tauri + Vue 3 + xterm.js 的 Windows 终端应用，已有核心终端能力：PowerShell/CMD/WSL2 PTY、xterm 渲染、多标签、分屏、主题/字体设置、快捷键和最近工作目录记忆。

接下来的主线不是重写终端核心，而是在保留现有能力的前提下，把产品推进为带工作台侧边栏的终端环境。

## 目标

第一阶段交付一个可迭代的 Workspace Sidebar：

- 侧边栏定位为工作台入口，同时承载 Explorer、Terminals、Claude Tasks 三类面板。
- 三个面板都先建立骨架，但只接入最小可用功能。
- 主终端区域继续保持现有交互和稳定性。
- 后续功能开发围绕工作台层扩展，避免污染 PTY 和 xterm 核心。

## 非目标

第一阶段不做以下内容：

- 不重写 PTY service、xterm 初始化或终端输入链路。
- 不做完整文件编辑器或复杂文件操作。
- 不做完整 Claude Code / gstack Agent 编排。
- 不做大规模架构重构、状态管理替换或 UI 主题重写。

## 推荐推进方式

采用分层交付：

1. 建立侧边栏框架和三个工作台面板骨架。
2. 先接入最小会话联动，让 Terminals 面板能反映并操作现有 tabs / panes。
3. 再补 Explorer 的项目入口和基础文件树能力。
4. 最后逐步接入 Claude Tasks 的真实任务状态与上下文能力。

这种方式能尽快形成产品结构，同时控制对现有终端核心的改动范围。

## 架构设计

新增一个工作台外壳层，承载侧边栏、主终端区域和后续工具面板。现有终端组件保持稳定：

- `TerminalPane` 继续负责 xterm 实例、PTY 输出写入、输入转发和 resize。
- 终端 tab / pane 状态继续由现有 Pinia store 管理。
- 侧边栏不直接操作 xterm 实例，只通过 store action 或明确事件调用现有能力。
- 工作台层负责布局、侧边栏状态、面板切换和跨面板协调。

建议的模块边界：

- Workspace shell：应用主布局，包含侧边栏和终端主区。
- Sidebar store：记录展开状态、当前面板、宽度和持久化偏好。
- Explorer panel：当前工作区、最近目录、打开文件夹入口，后续扩展文件树。
- Terminals panel：读取现有 tab / pane 状态，提供切换、新建、关闭入口。
- Claude Tasks panel：AI 工作入口与任务占位，后续接入真实任务流。

## 第一阶段功能范围

### Sidebar

- 支持展开/折叠。
- 支持 Explorer、Terminals、Claude Tasks 三个面板切换。
- 支持宽度调整。
- 持久化当前面板、展开状态和宽度。

### Explorer

- 显示当前工作区或启动目录。
- 显示最近目录入口。
- 提供打开文件夹入口。
- 文件树第一版可以是浅层或占位，完整文件浏览放到后续阶段。

### Terminals

- 展示当前 tabs / panes。
- 支持点击切换终端。
- 支持新建终端。
- 支持关闭终端，并复用现有关闭逻辑。

### Claude Tasks

- 显示任务面板骨架。
- 展示当前项目上下文提示。
- 预留 Claude Code / gstack 任务流入口。
- 第一阶段不实现复杂 Agent 编排。

## 数据流

- 用户点击侧边栏按钮后，sidebar store 更新 active panel。
- Terminals panel 从 terminal store 派生 tab / pane 列表。
- Terminals panel 的操作调用 terminal store 中已有的新建、切换、关闭能力。
- Explorer panel 的目录信息来自应用启动目录、最近目录或后续 Tauri command。
- Claude Tasks panel 第一阶段只保存本地 UI 状态，不影响终端运行。

## 质量策略

每个阶段都必须保护现有黄金路径：

- 启动应用。
- 打开 PowerShell。
- 输入命令并看到输出。
- 中文输出正常。
- 切换 tab。
- 分屏和关闭 pane。
- 主题、字体、快捷键基础行为不回退。

代码整理只围绕工作台落地展开：

- 新增状态放到清晰的 Pinia store。
- 新增 UI 拆成边界明确的小组件。
- 避免把侧边栏逻辑写进 `TerminalPane`。
- Rust 侧只在需要真实文件/目录能力时新增小而明确的 command。

## 风险与后续队列

以下问题应作为后续稳定化任务处理，不混入第一阶段的大功能改动：

- Tauri CSP 当前偏宽，需要生产化前收紧。
- PowerShell prompt 注入用于追踪 cwd，后续需要评估侵入性和失败场景。
- PTY cleanup 需要更明确的进程终止保证。
- 前端全局 `window` 事件随着功能增长会变脆，需要逐步收敛到 store 或明确 composable。
- 项目身份仍有模板痕迹，例如 package/product metadata 需要产品化。

## 验收标准

第一阶段完成时应满足：

- 应用可正常启动并显示工作台侧边栏。
- 侧边栏可以折叠、调整宽度、切换三个面板，并在重启后保留状态。
- Terminals 面板能展示并切换现有终端会话。
- 新建和关闭终端不破坏现有 tab / pane 行为。
- Explorer 和 Claude Tasks 至少有明确入口和稳定占位，不出现未完成 UI 断裂。
- 前端构建通过。
- Rust/Tauri 检查通过或明确记录外部环境阻塞。
