# 标签颜色标记功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LumiTerm 标签页添加颜色标记功能，通过颜色快速识别标签状态

**Architecture:** 扩展 Tab 数据模型增加 color 字段，在 TabBar 组件中添加颜色选择器 UI（圆点按钮 + 弹出气泡），通过 store 方法管理颜色状态

**Tech Stack:** Vue 3 Composition API, Pinia, TypeScript

---

## File Structure

**Modified files:**
- `src/stores/terminalStore.ts` - 扩展 Tab 接口，添加 setTabColor 方法
- `src/components/TabBar.vue` - 添加颜色选择器 UI 和交互逻辑

**No new files needed** - 功能完全集成到现有组件中

---

### Task 1: 扩展 Tab 数据模型

**Files:**
- Modify: `src/stores/terminalStore.ts:6-11`

- [ ] **Step 1: 在 Tab 接口中添加 color 字段**

在 `src/stores/terminalStore.ts` 的 Tab 接口中添加可选的 color 字段：

```typescript
export interface Tab {
  id: string;
  title: string;
  shellType: ShellType;
  sessionId: string | null;
  color?: string; // 颜色标记，存储色值如 '#ef4444'
}
```

- [ ] **Step 2: 添加 setTabColor 方法**

在 terminalStore 的 return 语句之前添加 setTabColor 方法：

```typescript
function setTabColor(tabId: string, color: string | null) {
  const tab = tabs.value.find((t) => t.id === tabId);
  if (!tab) return;
  
  if (color === null) {
    delete tab.color;
  } else {
    tab.color = color;
  }
}
```

- [ ] **Step 3: 导出 setTabColor 方法**

修改 return 语句，添加 setTabColor：

```typescript
return { 
  tabs, 
  activeTabId, 
  createTab, 
  setSessionId, 
  removeTab, 
  switchTab, 
  reorderTabs, 
  renameTab, 
  closeOtherTabs,
  setTabColor  // 新增
};
```

- [ ] **Step 4: 提交 store 修改**

```bash
git add src/stores/terminalStore.ts
git commit -m "feat(store): add color field to Tab interface and setTabColor method"
```

---

### Task 2: 添加颜色选择器状态和常量

**Files:**
- Modify: `src/components/TabBar.vue:1-50`

- [ ] **Step 1: 添加 ColorPickerState 接口**

在 TabBar.vue 的 `<script setup>` 中，EditState 接口之后添加：

```typescript
interface ColorPickerState {
  visible: boolean;
  targetTabId: string;
  x: number;
  y: number;
}
```

- [ ] **Step 2: 添加颜色选择器状态**

在 `editState` 定义之后添加：

```typescript
const colorPickerState = ref<ColorPickerState | null>(null);
```

- [ ] **Step 3: 定义预设颜色常量**

在 `shells` 数组定义之后添加：

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

- [ ] **Step 4: 提交状态和常量**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add color picker state and preset colors"
```

---

### Task 3: 实现颜色选择器事件处理

**Files:**
- Modify: `src/components/TabBar.vue:50-150`

- [ ] **Step 1: 添加打开颜色选择器方法**

在 `handleRename` 函数之后添加：

```typescript
function openColorPicker(e: MouseEvent, tabId: string) {
  e.stopPropagation();
  const rect = (e.target as HTMLElement).getBoundingClientRect();
  colorPickerState.value = {
    visible: true,
    targetTabId: tabId,
    x: rect.left,
    y: rect.bottom + 4,
  };
}
```

- [ ] **Step 2: 添加选择颜色方法**

```typescript
function selectColor(color: string) {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, color);
  colorPickerState.value = null;
}
```

- [ ] **Step 3: 添加清除颜色方法**

```typescript
function clearColor() {
  if (!colorPickerState.value) return;
  store.setTabColor(colorPickerState.value.targetTabId, null);
  colorPickerState.value = null;
}
```

- [ ] **Step 4: 添加关闭颜色选择器的全局监听**

在 `onMounted` 钩子中，现有的 `document.addEventListener('pointerdown', ...)` 之后添加颜色选择器关闭逻辑。

修改现有的 pointerdown 监听器：

```typescript
onMounted(() => {
  function handleGlobalPointerDown(e: PointerEvent) {
    // 关闭右键菜单
    if (contextMenuState.value) {
      const menu = document.querySelector('.context-menu');
      if (menu && !menu.contains(e.target as Node)) {
        contextMenuState.value = null;
      }
    }
    
    // 关闭颜色选择器
    if (colorPickerState.value) {
      const picker = document.querySelector('.color-picker');
      if (picker && !picker.contains(e.target as Node)) {
        colorPickerState.value = null;
      }
    }
  }
  
  document.addEventListener('pointerdown', handleGlobalPointerDown);
  
  onUnmounted(() => {
    document.removeEventListener('pointerdown', handleGlobalPointerDown);
  });
});
```

- [ ] **Step 5: 提交事件处理逻辑**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add color picker event handlers"
```

---

### Task 4: 添加颜色选择器 UI 模板

**Files:**
- Modify: `src/components/TabBar.vue:150-320`

- [ ] **Step 1: 在标签中添加彩色竖条**

在 `<template>` 中，找到 `.tab` 元素，在 `.tab-icon` 之前添加彩色竖条：

```vue
<div
  v-for="(tab, index) in store.tabs"
  :key="tab.id"
  class="tab"
  :class="{ active: tab.id === store.activeTabId, dragging: dragState?.draggedTabId === tab.id }"
  :style="dragState?.draggedTabId === tab.id ? { transform: `translateX(${dragState.currentX - dragState.startX}px)` } : {}"
  @pointerdown="handlePointerDown($event, tab.id, index)"
  @contextmenu.prevent="handleContextMenu($event, tab.id)"
>
  <!-- 彩色竖条 -->
  <div v-if="tab.color" class="tab-color-bar" :style="{ backgroundColor: tab.color }"></div>
  
  <span class="tab-icon">{{ iconMap[tab.shellType] }}</span>
  <!-- 其余内容保持不变 -->
```

- [ ] **Step 2: 在标签中添加颜色圆点按钮**

在 `.tab-close` 之前添加颜色圆点：

```vue
  <!-- 颜色圆点 -->
  <div
    class="tab-color-dot"
    :class="{ 'has-color': tab.color }"
    :style="tab.color ? { backgroundColor: tab.color } : {}"
    @click="openColorPicker($event, tab.id)"
    @pointerdown.stop
  ></div>
  
  <div class="tab-close" @click="closeTab($event, tab.id)">×</div>
```

- [ ] **Step 3: 添加颜色选择器弹出层**

在 `</template>` 结束标签之前，context-menu 之后添加：

```vue
<!-- 颜色选择器 -->
<div
  v-if="colorPickerState"
  class="color-picker"
  :style="{ left: colorPickerState.x + 'px', top: colorPickerState.y + 'px' }"
>
  <div
    v-for="color in PRESET_COLORS"
    :key="color.value"
    class="color-option"
    :style="{ backgroundColor: color.value }"
    :title="color.label"
    @click="selectColor(color.value)"
  ></div>
  <div class="color-option clear" title="清除颜色" @click="clearColor">
    <span style="font-size: 14px; color: #6b7280;">×</span>
  </div>
</div>
```

- [ ] **Step 4: 提交 UI 模板**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add color picker UI template"
```

---

### Task 5: 添加颜色选择器样式

**Files:**
- Modify: `src/components/TabBar.vue:320-459`

- [ ] **Step 1: 添加彩色竖条样式**

在 `<style scoped>` 中，`.tab` 样式之后添加：

```css
.tab-color-bar {
  position: absolute;
  left: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 4px;
  height: 80%;
  border-radius: 2px;
}
```

- [ ] **Step 2: 调整 tab 样式支持彩色竖条**

修改 `.tab` 样式，添加 `position: relative;` 和调整 padding：

```css
.tab {
  position: relative;  /* 新增 */
  height: 32px;
  min-width: 140px;
  max-width: 200px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 6px;
  display: flex;
  align-items: center;
  padding: 0 10px 0 14px;  /* 左侧增加 4px 为竖条留空间 */
  gap: 8px;
  cursor: grab;
  transition: all 0.15s ease;
  flex-shrink: 0;
  color: #cdd6f4;
}
```

- [ ] **Step 3: 添加颜色圆点样式**

在 `.tab-close` 样式之后添加：

```css
.tab-color-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background-color: rgba(255, 255, 255, 0.3);
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
  opacity: 0;
}

.tab:hover .tab-color-dot {
  opacity: 1;
}

.tab-color-dot.has-color {
  opacity: 1;
}

.tab-color-dot:hover {
  transform: scale(1.15);
  filter: brightness(1.1);
}
```

- [ ] **Step 4: 添加颜色选择器样式**

在文件末尾，`.tab-title-input` 样式之后添加：

```css
.color-picker {
  position: fixed;
  background: rgba(30, 30, 30, 0.95);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  z-index: 2000;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}

.color-option {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  cursor: pointer;
  transition: transform 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-option:hover {
  transform: scale(1.15);
}

.color-option.clear {
  background: rgba(107, 114, 128, 0.3);
  border: 1px dashed rgba(107, 114, 128, 0.6);
}
```

- [ ] **Step 5: 提交样式**

```bash
git add src/components/TabBar.vue
git commit -m "style(TabBar): add color picker and color indicator styles"
```

---

### Task 6: 测试和验证

**Files:**
- Test: `src/components/TabBar.vue`, `src/stores/terminalStore.ts`

- [ ] **Step 1: 启动开发服务器**

```bash
npx pnpm tauri dev
```

预期：应用正常启动，无编译错误

- [ ] **Step 2: 测试颜色圆点显示**

操作：
1. 打开应用，创建一个标签
2. Hover 到标签上

预期：关闭按钮左侧出现半透明灰色圆点

- [ ] **Step 3: 测试打开颜色选择器**

操作：点击颜色圆点

预期：
- 圆点下方弹出颜色选择器
- 显示 8 种颜色 + 清除按钮（3x3 网格）

- [ ] **Step 4: 测试选择颜色**

操作：点击红色

预期：
- 颜色选择器关闭
- 标签左侧出现红色竖条
- 圆点变为红色并始终可见

- [ ] **Step 5: 测试清除颜色**

操作：
1. 再次点击圆点打开选择器
2. 点击清除按钮（带 × 的圆圈）

预期：
- 颜色选择器关闭
- 红色竖条消失
- 圆点恢复半透明灰色

- [ ] **Step 6: 测试多标签颜色**

操作：
1. 创建 3 个标签
2. 分别设置为红色、绿色、蓝色

预期：每个标签显示对应颜色的竖条和圆点

- [ ] **Step 7: 测试与 active 状态的交互**

操作：
1. 给一个标签设置颜色
2. 切换到该标签使其 active

预期：
- 标签背景变为蓝色（active 状态）
- 彩色竖条和圆点仍然可见

- [ ] **Step 8: 测试与拖拽的兼容性**

操作：
1. 给标签设置颜色
2. 拖拽该标签到其他位置

预期：
- 拖拽正常工作
- 颜色标记保持不变

- [ ] **Step 9: 测试与重命名的兼容性**

操作：
1. 给标签设置颜色
2. 右键重命名标签

预期：
- 重命名正常工作
- 颜色标记保持不变

- [ ] **Step 10: 测试点击外部关闭选择器**

操作：
1. 打开颜色选择器
2. 点击选择器外部区域

预期：颜色选择器关闭

- [ ] **Step 11: 最终提交**

如果所有测试通过：

```bash
git add -A
git commit -m "test: verify tab color marking feature works correctly"
```

---

## 实现注意事项

1. **事件冒泡控制：** 颜色圆点的 `@pointerdown.stop` 和 `@click` 中的 `e.stopPropagation()` 防止触发标签拖拽
2. **样式优先级：** 彩色竖条使用 `position: absolute`，不影响标签内部 flex 布局
3. **颜色持久化：** 当前实现颜色仅存在内存中，关闭应用后丢失（未来可扩展到 localStorage）
4. **边界情况：** 颜色选择器固定定位，靠近屏幕边缘时可能溢出（当前实现未处理，可作为后续优化）

## 完成标准

- ✅ Tab 接口包含 color 字段
- ✅ terminalStore 提供 setTabColor 方法
- ✅ 标签显示彩色竖条和圆点
- ✅ 点击圆点打开颜色选择器
- ✅ 选择颜色后正确应用
- ✅ 清除颜色功能正常
- ✅ 不干扰现有功能（拖拽、重命名、关闭）
- ✅ 所有测试步骤通过
