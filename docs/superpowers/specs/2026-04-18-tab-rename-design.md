# 标签重命名功能设计文档

## 概述

为 LumiTerm 添加标签重命名功能，支持右键菜单触发、内联编辑模式，并扩展右键菜单包含完整的标签管理选项（重命名 / 关闭标签 / 关闭其他标签）。

## 目标

- 用户可以通过右键菜单重命名标签
- 提供内联编辑体验，标题直接变为可编辑输入框
- 扩展右键菜单，支持常用标签管理操作
- 保持与现有拖拽排序功能的兼容性

## 技术栈

- Vue 3 Composition API + TypeScript
- Pinia 状态管理
- Teleport 组件（菜单渲染到 body，避免被截断）
- 原生 DOM 事件（contextmenu、focus、blur）

## 架构设计

### 组件结构

```
TabBar.vue
├─ 右键菜单（ContextMenu）
│  ├─ 重命名
│  ├─ 关闭标签
│  └─ 关闭其他标签
└─ 标签项（Tab）
   ├─ 正常模式：<span> 显示标题
   └─ 编辑模式：<input> 内联编辑
```

### 状态管理

**TabBar.vue 新增状态：**

```typescript
// 右键菜单状态
interface ContextMenuState {
  visible: boolean;      // 菜单是否显示
  x: number;             // 菜单 X 坐标（相对视口）
  y: number;             // 菜单 Y 坐标（相对视口）
  targetTabId: string;   // 目标标签 ID
}

// 编辑状态
interface EditState {
  editingTabId: string;   // 正在编辑的标签 ID
  originalTitle: string;  // 原始标题（用于取消时恢复）
}
```

**terminalStore.ts 新增方法：**

```typescript
function renameTab(tabId: string, newTitle: string): void
function closeOtherTabs(keepTabId: string): void
```

## 交互流程

### 1. 右键菜单触发

```
用户右键点击标签
  ↓
阻止默认浏览器菜单（e.preventDefault()）
  ↓
记录鼠标位置和目标标签 ID
  ↓
显示自定义右键菜单（Teleport 到 body）
```

### 2. 重命名流程

```
点击菜单"重命名"选项
  ↓
隐藏菜单
  ↓
标签标题从 <span> 切换为 <input>
  ↓
自动聚焦并全选文字（input.select()）
  ↓
用户编辑
  ↓
确认方式：
  - Enter 键 → 提交
  - Escape 键 → 取消，恢复原标题
  - 失焦（blur）→ 提交
  ↓
验证：空字符串 → 恢复原标题
  ↓
调用 store.renameTab(tabId, newTitle)
  ↓
退出编辑模式
```

### 3. 关闭标签流程

```
点击菜单"关闭标签"选项
  ↓
调用现有 closeTab() 逻辑
  ↓
隐藏菜单
```

### 4. 关闭其他标签流程

```
点击菜单"关闭其他标签"选项
  ↓
调用 store.closeOtherTabs(targetTabId)
  ↓
隐藏菜单
```

## 数据流

### Store 层（terminalStore.ts）

**renameTab 方法：**
```typescript
function renameTab(tabId: string, newTitle: string) {
  const tab = tabs.value.find(t => t.id === tabId);
  if (!tab) return;
  
  const trimmed = newTitle.trim();
  if (trimmed.length === 0) return; // 空名称不更新
  
  tab.title = trimmed;
}
```

**closeOtherTabs 方法：**
```typescript
function closeOtherTabs(keepTabId: string) {
  const keepTab = tabs.value.find(t => t.id === keepTabId);
  if (!keepTab) return;
  
  tabs.value = [keepTab];
  activeTabId.value = keepTabId;
}
```

### UI 层（TabBar.vue）

**右键菜单定位：**
- 使用 `position: fixed`
- 根据鼠标位置 `(clientX, clientY)` 设置 `left` 和 `top`
- 使用 `<Teleport to="body">` 渲染，避免被 `.tab-bar` 的 `overflow: auto` 截断

**内联编辑实现：**
- 条件渲染：`editState?.editingTabId === tab.id ? <input> : <span>`
- `<input>` 自动聚焦：`@vue:mounted="(el) => el.select()"`
- 事件绑定：
  - `@keydown.enter` → 确认编辑
  - `@keydown.escape` → 取消编辑
  - `@blur` → 确认编辑

**菜单关闭逻辑：**
- 点击菜单项 → 执行操作后关闭
- 点击菜单外部 → 关闭（全局 click 监听）
- 开始编辑 → 关闭菜单

## 验证规则

**标签名称验证：**
- 不允许空名称（空字符串或纯空格）
- 空名称时恢复原标题
- 无长度限制
- 无特殊字符限制（支持中文、emoji、符号等）

## 错误处理

**边界情况：**
1. **只有1个标签时：** "关闭其他标签"选项禁用（添加 `disabled` 类和 `cursor: not-allowed`）
2. **编辑时切换标签：** 自动确认当前编辑，然后切换
3. **编辑时拖拽标签：** 拖拽开始时取消编辑（在 `handlePointerDown` 中检查）
4. **标签不存在：** `renameTab` 和 `closeOtherTabs` 方法内部做空值检查

**用户体验优化：**
- 菜单显示时，点击其他标签 → 先关闭菜单，不触发标签切换
- 编辑时，点击其他标签 → 确认编辑并切换
- 右键菜单位置智能调整（如果超出视口，向左/向上偏移）

## 样式设计

**右键菜单样式：**
```css
.context-menu {
  position: fixed;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  min-width: 160px;
  z-index: 2000; /* 高于标签栏 */
}

.context-menu-item {
  padding: 9px 14px;
  font-size: 13px;
  color: #cdd6f4;
  cursor: pointer;
  transition: background 0.1s ease;
}

.context-menu-item:hover {
  background: #313244;
}

.context-menu-item.disabled {
  color: #6c7086;
  cursor: not-allowed;
}

.context-menu-item.disabled:hover {
  background: transparent;
}
```

**内联编辑样式：**
```css
.tab-title-input {
  background: #1e1e2e;
  border: 1px solid #89b4fa;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  color: #cdd6f4;
  outline: none;
  width: 100%;
}
```

## 测试计划

### 功能测试

1. **右键菜单显示**
   - 右键点击标签 → 菜单在鼠标位置显示
   - 菜单包含3个选项：重命名 / 关闭标签 / 关闭其他标签
   - 菜单不被标签栏边界截断

2. **重命名功能**
   - 点击"重命名" → 标题变为 input，自动聚焦并全选
   - 输入新名称按 Enter → 标题更新
   - 输入新名称按 Escape → 取消编辑，恢复原标题
   - 输入新名称后失焦 → 标题更新
   - 输入空字符串确认 → 恢复原标题
   - 输入中文、emoji → 正常保存

3. **关闭标签功能**
   - 点击"关闭标签" → 标签关闭，符合现有逻辑
   - 关闭最后一个标签 → 应用退出

4. **关闭其他标签功能**
   - 点击"关闭其他标签" → 只保留当前标签
   - 只有1个标签时 → 选项禁用

5. **菜单交互**
   - 点击菜单外部 → 菜单关闭
   - 点击菜单项 → 执行操作并关闭菜单
   - 菜单显示时点击其他标签 → 菜单关闭，不切换标签

6. **编辑交互**
   - 编辑时点击其他标签 → 确认编辑并切换
   - 编辑时开始拖拽 → 取消编辑

### 边界测试

1. **单标签场景**
   - 只有1个标签时，"关闭其他标签"禁用
   - 右键菜单其他功能正常

2. **多标签场景**
   - 重命名第一个标签 → 正常
   - 重命名最后一个标签 → 正常
   - 重命名中间标签 → 正常

3. **兼容性测试**
   - 拖拽排序功能不受影响
   - 键盘快捷键（Ctrl+W、Ctrl+Tab）不受影响
   - 新建标签功能不受影响

### 性能测试

- 10个标签时，右键菜单响应流畅
- 编辑模式切换无卡顿

## 实现优先级

**Phase 1（核心功能）：**
1. Store 层：`renameTab` 方法
2. TabBar：右键菜单基础结构（仅"重命名"选项）
3. TabBar：内联编辑逻辑

**Phase 2（完整功能）：**
4. Store 层：`closeOtherTabs` 方法
5. TabBar：完整右键菜单（3个选项）
6. 边界处理和样式优化

**Phase 3（测试和优化）：**
7. 手动测试所有场景
8. 修复发现的问题

## 技术细节

### Teleport 使用

```vue
<Teleport to="body">
  <div
    v-if="contextMenuState?.visible"
    class="context-menu"
    :style="{ left: contextMenuState.x + 'px', top: contextMenuState.y + 'px' }"
  >
    <!-- 菜单项 -->
  </div>
</Teleport>
```

### 自动聚焦和全选

```vue
<input
  v-if="editState?.editingTabId === tab.id"
  ref="editInput"
  :value="tab.title"
  @vue:mounted="(el) => el.select()"
  @keydown.enter="confirmEdit"
  @keydown.escape="cancelEdit"
  @blur="confirmEdit"
/>
```

### 全局点击监听

```typescript
onMounted(() => {
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});

function handleGlobalClick(e: MouseEvent) {
  if (!contextMenuState.value?.visible) return;
  
  const menu = document.querySelector('.context-menu');
  if (menu && !menu.contains(e.target as Node)) {
    contextMenuState.value = null; // 关闭菜单
  }
}
```

## 与现有功能的集成

**与拖拽排序的兼容：**
- `handlePointerDown` 中检查编辑状态，如果正在编辑则先取消编辑
- 右键菜单显示时，禁用拖拽（检查 `contextMenuState.visible`）

**与关闭按钮的兼容：**
- 右键菜单的"关闭标签"复用现有 `closeTab()` 逻辑
- 保持确认对话框和应用退出逻辑不变

**与键盘快捷键的兼容：**
- 编辑模式下，Enter/Escape 被 input 捕获，不触发全局快捷键
- 其他快捷键（Ctrl+W、Ctrl+Tab）不受影响

## 未来扩展

本设计为未来功能预留扩展空间：

1. **标签颜色标记：** 右键菜单可添加"设置颜色"选项
2. **标签图标自定义：** 右键菜单可添加"更改图标"选项
3. **标签分组：** 右键菜单可添加"移动到分组"选项
4. **标签固定：** 右键菜单可添加"固定标签"选项

右键菜单的架构设计支持灵活添加新选项，无需重构核心逻辑。
