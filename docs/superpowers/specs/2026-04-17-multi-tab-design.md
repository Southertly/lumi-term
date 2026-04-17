# LumiTerm 多标签页功能设计

**日期：** 2026-04-17  
**状态：** 已批准

## 概述

为 LumiTerm 添加多标签页支持，允许用户在单个窗口中管理多个终端会话（PowerShell / CMD / WSL2）。

## 目标

- 支持在单窗口中打开多个终端标签
- 每个标签独立运行一个 shell 进程
- 提供直观的标签管理 UI（创建、切换、关闭）
- 支持快捷键操作

## 架构设计

### 前端架构

**组件结构：**
```
App.vue
├─ TabBar.vue (新增)
│  ├─ TabItem.vue (新增)
│  └─ NewTabDropdown.vue (新增)
└─ TerminalContainer.vue (新增)
   └─ TerminalTab.vue (改造)
```

**状态管理（Pinia Store）：**
```typescript
interface Tab {
  id: string;           // UUID
  title: string;        // 标签标题（默认为 shell 类型）
  shellType: 'powershell' | 'cmd' | 'wsl2';
  sessionId: string;    // PTY session ID
}

store: {
  tabs: Tab[];
  activeTabId: string | null;
  createTab(shellType: string): void;
  closeTab(id: string): void;
  switchTab(id: string): void;
}
```

### 后端架构

后端无需修改。现有 PTY service 已支持多会话管理（`HashMap<String, PtySession>`）。

### 渲染策略

**方案 A（采用）：** 前端维护多个 xterm.js 实例
- 每个标签对应一个独立的 xterm.js 实例
- 非活动标签通过 CSS `display: none` 隐藏
- 优点：切换标签无延迟，用户体验最佳
- 缺点：内存占用略高（可接受）

## UI 设计

### 视觉设计

- **配色：** 延续 Catppuccin Mocha 主题
  - 标签栏背景：`#181825`
  - 活动标签：`#89b4fa`（蓝色高亮）
  - 非活动标签：`#1e1e2e`
- **布局：** 标签栏高度 40px，位于 titlebar 下方
- **标签样式：** 圆角 6px，最小宽度 140px

### 交互设计

**标签创建：**
- 点击 "+" 按钮弹出下拉菜单
- 菜单选项：PowerShell / CMD / WSL2
- 默认快捷键 Ctrl+T 创建 PowerShell 标签

**标签切换：**
- 点击标签切换
- Ctrl+Tab / Ctrl+Shift+Tab 循环切换
- Ctrl+1~9 跳转到指定标签

**标签关闭：**
- 点击标签上的 × 按钮
- 快捷键 Ctrl+W 关闭当前标签
- 自动终止对应的 shell 进程
- 如果有正在运行的子进程，弹窗确认
- 关闭最后一个标签时，应用退出

## 数据流

### 创建标签流程
```
用户点击 "+" → 选择 shell 类型 → store.createTab()
→ 生成 UUID → 调用 create_pty 命令 → 获得 sessionId
→ 创建 xterm.js 实例 → 绑定 PTY 输出 → 添加到 tabs 数组
```

### 切换标签流程
```
用户点击标签 / 按快捷键 → store.switchTab(id)
→ 更新 activeTabId → CSS 切换显示/隐藏
→ 调用 fitAddon.fit() 重新计算尺寸
```

### 关闭标签流程
```
用户点击 × / 按 Ctrl+W → 检查是否有子进程
→ 如有子进程，弹窗确认 → 调用 close_pty_cmd
→ 销毁 xterm.js 实例 → store.removeSession(id)
→ 如果是最后一个标签，退出应用
```

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| Ctrl+T | 新建 PowerShell 标签 |
| Ctrl+W | 关闭当前标签 |
| Ctrl+Tab | 切换到下一个标签 |
| Ctrl+Shift+Tab | 切换到上一个标签 |
| Ctrl+1~9 | 跳转到第 N 个标签 |

## 技术栈

- **前端：** Vue 3 + Pinia + xterm.js
- **后端：** Rust + Tauri + portable-pty（无需修改）
- **快捷键：** Tauri GlobalShortcut API

## 测试策略

### 手动测试
1. 创建多个不同类型的标签（PowerShell / CMD / WSL2）
2. 在每个标签中运行命令，验证输出正确
3. 切换标签，验证状态保持
4. 关闭标签，验证进程终止
5. 测试所有快捷键
6. 测试关闭最后一个标签时应用退出

### 边界情况
- 打开 10+ 个标签，验证性能
- 快速连续创建/关闭标签
- 在有运行中进程的标签上测试关闭确认
- 窗口 resize 时验证所有标签的 xterm.js 正确适配

## 实现优先级

**Phase 1（MVP）：**
- 基础标签管理（创建、切换、关闭）
- 支持 PowerShell / CMD / WSL2
- 点击交互

**Phase 2（增强）：**
- 快捷键支持
- 关闭确认对话框
- 标签标题自定义

**Phase 3（优化）：**
- 标签拖拽排序
- 右键菜单
- 标签持久化（重启恢复）
