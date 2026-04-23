# 内联历史列表设计文档

**日期：** 2026-04-23  
**状态：** 已确认，待实现

## 目标

将现有分离式 InputBar（flex 底部独立区域）改造为视觉上内嵌在终端内部的输入体验，并将 Ctrl+R 历史搜索浮层替换为聚焦自动弹出的内联历史列表。

## 现状问题

- `TerminalPane.vue` 使用 flex 列布局，xterm 容器（`flex:1`）和 `InputBar`（`flex-shrink:0`）上下分离
- 视觉上输入框在终端外部，不符合 Warp 风格的"在终端内输入"体验
- 历史搜索需要 Ctrl+R 手动触发，不够自然

## 设计方案（方案 F）

### 布局变化

**改动前：**
```
pane-wrapper (flex-direction: column)
  ├── terminal-container (flex: 1)        ← xterm 输出
  ├── HistorySearch (absolute popup)      ← Ctrl+R 浮层
  └── InputBar (flex-shrink: 0)           ← 独立底部区域，有上边框
```

**改动后：**
```
pane-wrapper (position: relative)
  ├── terminal-container (width/height: 100%)  ← xterm 占满全部空间
  └── InputBar (position: absolute, bottom: 0) ← 叠加在 xterm 底部，半透明背景
```

- xterm 容器改为 `position: absolute; inset: 0`（占满 pane-wrapper 全部空间）
- InputBar 改为 `position: absolute; bottom: 0; left: 0; right: 0`（叠加在 xterm 内部底部）
- InputBar 背景使用半透明（`rgba(28,28,30,0.96)`），让 xterm 内容在后方隐约可见
- xterm 容器的 `.xterm` 元素通过 CSS `padding-bottom` 动态等于 InputBar 当前高度（默认约 52px，历史列表展开时约 52 + 列表高度），由 Vue `ref` 读取 InputBar DOM 高度后赋值，变化时重新调用 `fitAddon.fit()`

### InputBar 内联历史列表

#### 触发逻辑
| 事件 | 行为 |
|------|------|
| 输入框聚焦 | 显示最近 10 条历史（`historyStore.list().slice(0, 10)`） |
| 输入任意字符 | 实时 frecency 过滤，最多显示 10 条 |
| 清空输入 | 恢复显示最近 10 条 |
| 执行命令（Enter） | 关闭列表，清空输入 |
| Escape | 关闭列表，保留当前输入内容 |
| 输入框失焦 | 延迟 150ms 关闭（避免点击列表项时提前关闭） |

#### 键盘导航
| 按键 | 行为 |
|------|------|
| ↑ | 在历史列表中向上移动选中项 |
| ↓ | 在历史列表中向下移动选中项 |
| Enter | 执行选中项（若有选中），否则执行输入框内容 |
| Tab | 将选中项填入输入框，不执行 |
| Escape | 关闭列表，不改变输入内容 |

#### 排序规则
- **无过滤词（空输入）：** 按 `lastUsedAt` 降序（最近使用优先）
- **有过滤词：** 按 frecency 评分降序（`useCount / log(daysSince + 2)`）
- 最多显示 10 条

#### 视觉规格
- 列表位于输入行下方，用细分隔线隔开
- 选中项：左侧 2px accent 色边框 + 淡蓝背景 `rgba(91,156,246,0.12)`
- 未选中项：muted 前景色
- 每项格式：`❯ <command>`，鼠标 hover 触发高亮
- 列表头：`历史 N 条 · 输入过滤`（N 为当前显示数量）

### 移除内容
- `HistorySearch.vue` 组件（整个文件删除）
- `TerminalPane.vue` 中对 `HistorySearch` 的引用和 `showHistorySearch` 状态
- `App.vue` 中 `lumiterm:history-search` 事件的派发
- `TerminalPane.vue` 中 `handleOpenHistorySearch` 函数
- InputBar 内 `↑↓ 历史` 提示文字

## 受影响文件

| 文件 | 操作 |
|------|------|
| `src/components/InputBar.vue` | 修改：改为 absolute 定位，添加内联历史列表 |
| `src/components/TerminalPane.vue` | 修改：xterm 改为 absolute fill，移除 HistorySearch 引用 |
| `src/components/HistorySearch.vue` | 删除 |
| `src/App.vue` | 修改：移除 `lumiterm:history-search` 事件派发逻辑 |

**不需要改动：** `terminalStore.ts`、`historyStore.ts`、`xtermInitializer.ts`、Rust 后端

## 边界情况

- **interactive mode（vim/htop）：** InputBar 已有 `isInteractive` prop，进入 alternate screen 时隐藏 InputBar（`display:none`），xterm 全屏，行为不变
- **分屏（SplitPane）：** 每个 `TerminalPane` 独立，各自的 InputBar 叠加在各自的 xterm 容器内，互不影响
- **xterm padding：** 通过 `terminal.options.scrollbackPaddingBottom`（xterm.js 支持）或 CSS padding-bottom 实现，防止最后几行被 InputBar 遮挡
