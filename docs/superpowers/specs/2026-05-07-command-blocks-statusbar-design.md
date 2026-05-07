# Command Blocks 底部状态栏 — 设计文档

**日期：** 2026-05-07
**状态：** 已确认，待实现

---

## 背景

Phase 1 已完成 Command Blocks 的底层基础设施（OSC 133 解析、commandBlockStore、CommandBlock 组件），但原有的覆盖层（overlay）方案会遮挡终端内容，已被临时注释掉。本设计提供一个不遮挡终端的 UI 方案。

---

## 目标

在不遮挡终端内容的前提下，让用户能够：
1. 随时看到最近几条命令的执行状态
2. 按需查看完整的命令历史列表

---

## 设计方案

### 整体交互

```
┌─────────────────────────────────────┐
│                                     │
│         终端内容区（完整高度）         │
│                                     │
│                                     │
├─────────────────────────────────────┤  ← 点击展开/收起
│ ✓ echo hello 12ms  ✗ bad-cmd 8ms   │  状态栏 28px
└─────────────────────────────────────┘

点击后向上展开：

┌─────────────────────────────────────┐
│                                     │
│         终端内容区（完整高度）         │
│                                     │
├─────────────────────────────────────┤
│ 命令历史                        ▲   │
│ ✓  echo hello              12ms    │
│ ✗  bad-cmd                  8ms    │  命令历史面板
│ ✓  Get-ChildItem           234ms   │  ~200px，可滚动
│ ⏳  npm install           运行中    │
├─────────────────────────────────────┤
│ ✓ echo hello 12ms  ✗ bad-cmd 8ms   │  状态栏 28px
└─────────────────────────────────────┘
```

### 状态栏（CommandStatusBar）

- **高度：** 28px，固定在 `.pane-wrapper` 底部
- **内容：** 显示最近 3 条命令，每条显示：状态图标 + 命令文本（截断）+ 耗时
- **颜色：** 成功绿色 `#4caf50`，失败红色 `#f44336`，运行中橙色 `#ff9800`
- **背景：** 半透明深色，与终端主题 `--ui-bg` 一致
- **交互：** 点击整个状态栏切换展开/收起

### 命令历史面板

- **触发：** 点击状态栏展开，再次点击收起
- **位置：** 绝对定位，紧贴状态栏向上展开，`bottom: 28px`
- **高度：** 最大 200px，内容超出时可滚动
- **内容：** 每条命令一行，显示：状态图标 + 命令文本 + 耗时
- **不显示：** 命令输出内容（保持简洁）
- **动画：** CSS transition，高度从 0 展开到 max-height，0.15s ease
- **z-index：** 20（高于终端，低于右键菜单的 9999）

---

## 组件设计

### 新建：`src/components/CommandStatusBar.vue`

**Props：**
```typescript
defineProps<{
  paneId: string;
}>();
```

**内部状态：**
```typescript
const expanded = ref(false);
```

**数据来源：** 复用已有的 `useCommandBlockStore()`，通过 `blockStore.getBlocks(paneId)` 获取数据。

**模板结构：**
```
.status-bar-wrapper
  .history-panel (v-show="expanded")
    .history-item (v-for block in allBlocks)
  .status-bar (@click="toggle")
    .status-item (v-for block in recentBlocks — 最近3条)
```

### 修改：`src/components/TerminalPane.vue`

1. 引入 `CommandStatusBar` 组件
2. 在 `.pane-wrapper` 内、右键菜单 Teleport 之前，添加：
   ```html
   <CommandStatusBar :pane-id="paneId" />
   ```
3. 给 `.terminal-container` 添加 `padding-bottom: 28px`，避免终端内容被状态栏遮挡

---

## 文件变更

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/components/CommandStatusBar.vue` | 状态栏 + 历史面板组件 |
| 修改 | `src/components/TerminalPane.vue` | 引入并挂载 CommandStatusBar |

---

## 已有基础设施（无需修改）

- `src/utils/oscParser.ts` — OSC 133 解析器 ✅
- `src/stores/commandBlockStore.ts` — 命令块状态管理 ✅
- `src/components/CommandBlock.vue` — 单条命令块渲染（暂不使用）✅
- `src-tauri/src/services/pty_service.rs` — OSC 133 注入 ✅

---

## 不在本次范围内

- 命令输出内容展示（Phase 3）
- 虚拟滚动（历史条数超过 100 条时优化）
- CMD / WSL2 shell 支持（OSC 133 仅注入 PowerShell）
- 命令重新执行功能
