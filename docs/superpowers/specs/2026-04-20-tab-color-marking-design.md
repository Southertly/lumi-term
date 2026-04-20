# 标签颜色标记功能设计

## 概述

为 LumiTerm 的标签页添加颜色标记功能，用于标识标签的状态（正在工作、待处理、已完成等），提升多标签管理效率。

## 功能目标

- 允许用户为每个标签页设置颜色标记
- 通过颜色快速识别标签状态
- 提供直观的颜色选择交互
- 不干扰现有的标签拖拽、重命名、关闭等功能

## 交互设计

### 颜色选择器触发方式

- 每个标签右侧（关闭按钮左边）添加一个小圆点按钮（直径 12px）
- 未标记状态：圆点为灰色半透明，hover 时完全显示
- 已标记状态：圆点显示对应的标记颜色，始终可见
- 点击圆点弹出颜色选择器气泡（类似现有的 shell 类型 dropdown）

### 颜色选择器 UI

- 气泡式弹出层，显示在圆点下方
- 网格布局展示 8 种预设颜色
- 每个颜色为圆形色块（直径 24px），hover 时放大
- 包含"清除颜色"选项（灰色 X 图标）
- 点击颜色或外部区域关闭选择器

### 视觉反馈

**标签左侧彩色竖条：**
- 宽度：4px
- 高度：标签高度的 80%，垂直居中
- 位置：标签左边缘内侧
- 圆角：2px

**圆点按钮：**
- 未标记：`rgba(255, 255, 255, 0.3)` hover 时 `rgba(255, 255, 255, 0.6)`
- 已标记：显示对应颜色，hover 时亮度增加 10%

**与 active 状态的交互：**
- Active 标签保持蓝色背景（`#1e90ff`）
- 彩色竖条和圆点仍显示标记颜色，确保可见性

## 颜色方案

8 种预设颜色，每种对应典型的标签状态：

| 颜色 | 色值 | 语义 |
|------|------|------|
| 红色 | `#ef4444` | 紧急/错误 |
| 橙色 | `#f97316` | 警告/待处理 |
| 黄色 | `#eab308` | 提醒/注意 |
| 绿色 | `#22c55e` | 完成/正常 |
| 蓝色 | `#3b82f6` | 进行中 |
| 紫色 | `#a855f7` | 重要 |
| 粉色 | `#ec4899` | 其他 |
| 灰色 | `#6b7280` | 暂停/归档 |

## 技术实现

### 数据模型

**Tab 接口扩展（`src/stores/terminalStore.ts`）：**
```typescript
interface Tab {
  id: string;
  title: string;
  shellType: ShellType;
  color?: string; // 新增：颜色标记，存储色值（如 '#ef4444'）
}
```

### Store 方法

**terminalStore 新增方法：**
```typescript
setTabColor(tabId: string, color: string | null): void
```
- 设置指定标签的颜色
- `color` 为 `null` 时清除颜色标记

### 组件结构

**TabBar.vue 新增状态：**
```typescript
interface ColorPickerState {
  visible: boolean;
  targetTabId: string;
  x: number;
  y: number;
}

const colorPickerState = ref<ColorPickerState | null>(null);
```

**颜色常量：**
```typescript
const PRESET_COLORS = [
  { value: '#ef4444', label: '红色' },
  { value: '#f97316', label: '橙色' },
  { value: '#eab308', label: '黄色' },
  { value: '#22c55e', label: '绿色' },
  { value: '#3b82f6', label: '蓝色' },
  { value: '#a855f7', label: '紫色' },
  { value: '#ec4899', label: '粉色' },
  { value: '#6b7280', label: '灰色' },
];
```

### 事件处理

**打开颜色选择器：**
```typescript
function openColorPicker(e: MouseEvent, tabId: string) {
  e.stopPropagation(); // 防止触发标签点击
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  colorPickerState.value = {
    visible: true,
    targetTabId: tabId,
    x: rect.left,
    y: rect.bottom + 4,
  };
}
```

**选择颜色：**
```typescript
function selectColor(color: string) {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, color);
  colorPickerState.value = null;
}
```

**清除颜色：**
```typescript
function clearColor() {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, null);
  colorPickerState.value = null;
}
```

### 样式设计

**彩色竖条：**
```css
.tab-color-bar {
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 80%;
  border-radius: 2px;
  background-color: var(--tab-color);
}
```

**圆点按钮：**
```css
.tab-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-color-dot:hover {
  background-color: rgba(255, 255, 255, 0.6);
  transform: scale(1.1);
}

.tab-color-dot.has-color {
  background-color: var(--dot-color);
}
```

**颜色选择器：**
```css
.color-picker {
  position: fixed;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  z-index: 1000;
}

.color-option {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
}

.color-option:hover {
  transform: scale(1.2);
}
```

## 边界情况处理

1. **与拖拽的冲突：** 圆点按钮的 `pointerdown` 事件需要 `stopPropagation()`，防止触发标签拖拽
2. **与关闭按钮的间距：** 圆点与关闭按钮之间保持 8px 间距
3. **颜色选择器定位：** 当标签靠近屏幕右边缘时，选择器向左偏移，避免溢出
4. **点击外部关闭：** 使用 `onClickOutside` 或全局 `pointerdown` 监听器关闭选择器

## 测试要点

1. 点击圆点能正常打开/关闭颜色选择器
2. 选择颜色后，彩色竖条和圆点正确显示
3. 清除颜色后，竖条消失，圆点恢复默认状态
4. 不干扰标签拖拽、重命名、关闭功能
5. Active 标签的彩色标记仍然可见
6. 多个标签可以设置不同颜色
7. 颜色选择器不会溢出屏幕边界
