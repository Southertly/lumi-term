# 窗口控制按钮设计

**日期:** 2026-04-17  
**状态:** 待实现

## 概述

为 LumiTerm 的自定义标题栏添加标准 Windows 窗口控制按钮：最小化、最大化/还原、关闭。

## 背景

当前 LumiTerm 使用 `decorations: false` 禁用了系统标题栏，已实现自定义标题栏和关闭按钮。用户需要添加最小化和最大化功能。

## 设计

### UI 布局

标题栏右侧按钮组（从左到右）：

1. **最小化按钮** `—`
   - 点击后窗口最小化到任务栏
   - Hover: 背景变为 `#313244`

2. **最大化/还原按钮** `⬜` / `❐`
   - 未最大化时显示 `⬜`，点击后最大化
   - 已最大化时显示 `❐`，点击后还原
   - Hover: 背景变为 `#313244`

3. **关闭按钮** `✕` (已存在)
   - Hover: 背景变为 `#f38ba8` (红色)

### 按钮样式

- 尺寸: `32px × 24px`
- 间距: 按钮之间无间距，紧密排列
- 字体大小: `14px`
- 圆角: `4px`
- 过渡动画: `0.15s ease`

### 技术实现

#### 后端 (Rust)

在 `src-tauri/src/commands/pty.rs` 添加两个 Tauri 命令：

```rust
#[tauri::command]
pub fn minimize_window(window: tauri::Window) {
    window.minimize().unwrap();
}

#[tauri::command]
pub fn toggle_maximize(window: tauri::Window) {
    if window.is_maximized().unwrap() {
        window.unmaximize().unwrap();
    } else {
        window.maximize().unwrap();
    }
}
```

在 `src-tauri/src/lib.rs` 注册命令：
```rust
.invoke_handler(tauri::generate_handler![
    // ... 现有命令
    minimize_window,
    toggle_maximize,
])
```

#### 前端 (Vue)

在 `App.vue` 中：

1. 添加响应式状态跟踪窗口是否最大化
2. 监听 Tauri 的 `tauri://resize` 事件更新状态
3. 在 titlebar 中添加最小化和最大化按钮
4. 调用对应的 Tauri 命令

### 交互行为

- 点击最小化：窗口最小化到任务栏
- 点击最大化/还原：窗口在最大化和正常尺寸之间切换
- 双击标题栏：触发最大化/还原（可选，后续优化）

## 文件修改清单

1. `src-tauri/src/commands/pty.rs` - 添加窗口控制命令
2. `src-tauri/src/lib.rs` - 注册新命令
3. `src/App.vue` - 添加按钮 UI 和事件处理

## 测试验证

- [ ] 点击最小化按钮，窗口最小化到任务栏
- [ ] 点击最大化按钮，窗口全屏显示
- [ ] 最大化后按钮图标变为还原图标
- [ ] 点击还原按钮，窗口恢复原始尺寸
- [ ] 按钮 hover 效果正常
- [ ] 关闭按钮功能不受影响
