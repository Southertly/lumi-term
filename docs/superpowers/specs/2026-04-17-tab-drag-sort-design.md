# 标签拖拽排序设计

**日期:** 2026-04-17  
**状态:** 待实现

## 概述

为 LumiTerm 的标签栏添加拖拽排序功能，允许用户通过鼠标拖动重新排列标签顺序。

## 技术选型

- **方案:** 原生 pointer 事件 + CSS transform
- **动画:** 平滑滑动，150ms ease 过渡
- **无外部依赖**

## 架构

### 文件修改

- `src/stores/terminalStore.ts` — 添加 `reorderTabs(fromIndex, toIndex)` 方法
- `src/components/TabBar.vue` — 添加拖拽状态管理和 pointer 事件处理

### 数据结构

在 `TabBar.vue` 中新增拖拽状态：

```typescript
interface DragState {
  isDragging: boolean;
  draggedTabId: string;
  draggedIndex: number;
  currentIndex: number;
  startX: number;
  currentX: number;
}

const dragState = ref<DragState | null>(null);
```

## 交互流程

### 1. 开始拖拽 (pointerdown)

- 仅响应标签主体区域（排除关闭按钮 `.tab-close`）
- 记录：标签 ID、初始索引、鼠标起始 X 坐标
- 调用 `event.target.setPointerCapture(event.pointerId)` 确保鼠标离开元素后仍能接收事件
- 切换标签为 `.dragging` 状态

### 2. 拖动中 (pointermove)

- 计算偏移量：`deltaX = currentX - startX`
- 被拖标签：`transform: translateX(${deltaX}px)`（无过渡，跟随鼠标）
- 计算目标索引：
  ```typescript
  const TAB_WIDTH = 148; // min-width(140) + gap(4) + border(4)
  const newIndex = Math.max(0, Math.min(
    tabs.length - 1,
    draggedIndex + Math.round(deltaX / TAB_WIDTH)
  ));
  ```
- 其他标签根据 `newIndex` 计算偏移：
  - 在 `draggedIndex` 和 `newIndex` 之间的标签：向反方向移动一个 `TAB_WIDTH`
  - 其余标签：`transform: none`

### 3. 结束拖拽 (pointerup / pointercancel)

- 调用 `store.reorderTabs(draggedIndex, currentIndex)`
- 清空 `dragState`（Vue 重新渲染，移除所有 transform）

## Store 变更

在 `terminalStore.ts` 添加：

```typescript
function reorderTabs(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex) return;
  const tab = tabs.value.splice(fromIndex, 1)[0];
  tabs.value.splice(toIndex, 0, tab);
}
```

## CSS 样式

```css
/* 被拖动的标签 */
.tab.dragging {
  cursor: grabbing;
  opacity: 0.85;
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: none; /* 跟随鼠标，禁用过渡 */
}

/* 其他标签让位动画 */
.tab:not(.dragging) {
  transition: transform 0.15s ease;
}

/* 默认鼠标样式 */
.tab {
  cursor: grab;
}
```

## 边界情况

- **拖出标签栏区域:** `pointercancel` 触发，取消拖拽，标签回到原位
- **拖动关闭按钮:** 通过 `e.target.closest('.tab-close')` 检测，不触发拖拽
- **单个标签:** 只有一个标签时不触发拖拽（`tabs.length < 2`）
- **快速点击:** `pointerdown` 到 `pointerup` 位移 < 5px 视为点击，不触发拖拽

## 测试验证

- [ ] 拖动标签可以改变顺序
- [ ] 其他标签平滑让位（150ms 动画）
- [ ] 拖动时标签有阴影和半透明效果
- [ ] 松手后标签顺序正确更新
- [ ] 点击关闭按钮不触发拖拽
- [ ] 快速点击不触发拖拽（切换标签正常）
- [ ] 只有一个标签时不可拖拽
