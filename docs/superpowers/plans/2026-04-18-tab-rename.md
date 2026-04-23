# 标签重命名功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 LumiTerm 添加标签重命名功能，支持右键菜单触发、内联编辑模式，并扩展右键菜单包含完整的标签管理选项（重命名 / 关闭标签 / 关闭其他标签）。

**Architecture:** 在 terminalStore 添加 `renameTab` 和 `closeOtherTabs` 方法，在 TabBar.vue 添加右键菜单组件（使用 Teleport 渲染到 body）和内联编辑逻辑。右键菜单通过 contextmenu 事件触发，内联编辑通过条件渲染 input/span 实现。

**Tech Stack:** Vue 3 Composition API, TypeScript, Pinia, Teleport, 原生 DOM 事件

---

## Task 1: Store 层 - 添加 renameTab 方法

**Files:**
- Modify: `src/stores/terminalStore.ts:64` (在 return 语句前添加)

- [ ] **Step 1: 添加 renameTab 方法**

在 `reorderTabs` 函数后、`return` 语句前添加：

```typescript
  function renameTab(tabId: string, newTitle: string) {
    const tab = tabs.value.find(t => t.id === tabId);
    if (!tab) return;
    
    const trimmed = newTitle.trim();
    if (trimmed.length === 0) return; // 空名称不更新
    
    tab.title = trimmed;
  }
```

- [ ] **Step 2: 导出 renameTab 方法**

修改 return 语句（第64行）：

```typescript
  return { tabs, activeTabId, createTab, setSessionId, removeTab, switchTab, reorderTabs, renameTab };
```

- [ ] **Step 3: 验证类型检查**

运行类型检查：

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/stores/terminalStore.ts
git commit -m "feat(store): add renameTab method"
```

---

## Task 2: Store 层 - 添加 closeOtherTabs 方法

**Files:**
- Modify: `src/stores/terminalStore.ts:64` (在 return 语句前添加)

- [ ] **Step 1: 添加 closeOtherTabs 方法**

在 `renameTab` 函数后、`return` 语句前添加：

```typescript
  function closeOtherTabs(keepTabId: string) {
    const keepTab = tabs.value.find(t => t.id === keepTabId);
    if (!keepTab) return;
    
    // 保留目标标签，移除其他所有标签
    tabs.value = [keepTab];
    activeTabId.value = keepTabId;
  }
```

- [ ] **Step 2: 导出 closeOtherTabs 方法**

修改 return 语句：

```typescript
  return { tabs, activeTabId, createTab, setSessionId, removeTab, switchTab, reorderTabs, renameTab, closeOtherTabs };
```

- [ ] **Step 3: 验证类型检查**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/stores/terminalStore.ts
git commit -m "feat(store): add closeOtherTabs method"
```

---

## Task 3: TabBar - 添加右键菜单状态和编辑状态

**Files:**
- Modify: `src/components/TabBar.vue:16` (在 dragState 定义后添加)

- [ ] **Step 1: 添加状态接口定义**

在 `DragState` 接口定义后（第14行后）添加：

```typescript
interface ContextMenuState {
  visible: boolean;
  x: number;
  y: number;
  targetTabId: string;
}

interface EditState {
  editingTabId: string;
  originalTitle: string;
}
```

- [ ] **Step 2: 添加响应式状态**

在 `dragState` 定义后（第16行后）添加：

```typescript
const contextMenuState = ref<ContextMenuState | null>(null);
const editState = ref<EditState | null>(null);
```

- [ ] **Step 3: 验证类型检查**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add context menu and edit state"
```

---

## Task 4: TabBar - 实现右键菜单事件处理

**Files:**
- Modify: `src/components/TabBar.vue` (在 handlePointerUp 后添加函数)

- [ ] **Step 1: 添加 onMounted 和 onUnmounted 导入**

修改第2行的 import 语句：

```typescript
import { ref, onMounted, onUnmounted } from 'vue';
```

- [ ] **Step 2: 添加右键菜单显示函数**

在 `handlePointerUp` 函数后添加：

```typescript
function handleContextMenu(e: MouseEvent, tabId: string) {
  e.preventDefault();
  
  contextMenuState.value = {
    visible: true,
    x: e.clientX,
    y: e.clientY,
    targetTabId: tabId,
  };
}
```

- [ ] **Step 3: 添加全局点击监听关闭菜单**

在 `handleContextMenu` 函数后添加：

```typescript
function handleGlobalClick(e: MouseEvent) {
  if (!contextMenuState.value?.visible) return;
  
  const menu = document.querySelector('.context-menu');
  if (menu && !menu.contains(e.target as Node)) {
    contextMenuState.value = null;
  }
}

onMounted(() => {
  document.addEventListener('click', handleGlobalClick);
});

onUnmounted(() => {
  document.removeEventListener('click', handleGlobalClick);
});
```

- [ ] **Step 4: 添加菜单项点击处理函数**

在 `onUnmounted` 后添加：

```typescript
function handleRename() {
  if (!contextMenuState.value) return;
  
  const tab = store.tabs.find(t => t.id === contextMenuState.value!.targetTabId);
  if (!tab) return;
  
  editState.value = {
    editingTabId: tab.id,
    originalTitle: tab.title,
  };
  
  contextMenuState.value = null;
}

function handleCloseTab() {
  if (!contextMenuState.value) return;
  
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
  
  const tab = store.tabs.find(t => t.id === tabId);
  if (!tab) return;
  
  if (confirm(`关闭 ${tab.title}？`)) {
    store.removeTab(tabId);
    if (store.tabs.length === 0) {
      setTimeout(() => {
        import('@tauri-apps/api/core')
          .then(({ invoke }) => invoke('close_app'))
          .catch((err) => console.error('[TabBar] close_app failed:', err));
      }, 100);
    }
  }
}

function handleCloseOtherTabs() {
  if (!contextMenuState.value) return;
  
  const tabId = contextMenuState.value.targetTabId;
  contextMenuState.value = null;
  
  store.closeOtherTabs(tabId);
}
```

- [ ] **Step 5: 验证类型检查**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 6: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add context menu event handlers"
```

---

## Task 5: TabBar - 实现内联编辑事件处理

**Files:**
- Modify: `src/components/TabBar.vue` (在 handleCloseOtherTabs 后添加函数)

- [ ] **Step 1: 添加确认编辑函数**

在 `handleCloseOtherTabs` 函数后添加：

```typescript
function confirmEdit(e: Event) {
  if (!editState.value) return;
  
  const input = e.target as HTMLInputElement;
  const newTitle = input.value.trim();
  
  if (newTitle.length > 0) {
    store.renameTab(editState.value.editingTabId, newTitle);
  }
  
  editState.value = null;
}
```

- [ ] **Step 2: 添加取消编辑函数**

在 `confirmEdit` 函数后添加：

```typescript
function cancelEdit() {
  if (!editState.value) return;
  editState.value = null;
}
```

- [ ] **Step 3: 修改 handlePointerDown 检查编辑状态**

在 `handlePointerDown` 函数开头（第52行后）添加检查：

```typescript
function handlePointerDown(e: PointerEvent, tabId: string, index: number) {
  // Cancel editing if in edit mode
  if (editState.value) {
    cancelEdit();
  }

  // Ignore if clicking close button
  if ((e.target as HTMLElement).closest('.tab-close')) return;
  
  // ... 其余代码保持不变
```

- [ ] **Step 4: 验证类型检查**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add inline edit handlers"
```

---

## Task 6: TabBar - 添加右键菜单 UI 模板

**Files:**
- Modify: `src/components/TabBar.vue` (在 template 的 </div> 前添加 Teleport)

- [ ] **Step 1: 找到模板结束位置**

查找 template 中最外层 `<div class="tab-bar">` 的闭合标签位置（约第150行附近）

- [ ] **Step 2: 在闭合 </div> 前添加 Teleport 组件**

在 `</div>` 前添加：

```vue
  <Teleport to="body">
    <div
      v-if="contextMenuState?.visible"
      class="context-menu"
      :style="{ left: contextMenuState.x + 'px', top: contextMenuState.y + 'px' }"
      @click.stop
    >
      <div class="context-menu-item" @click="handleRename">
        重命名
      </div>
      <div class="context-menu-item" @click="handleCloseTab">
        关闭标签
      </div>
      <div
        class="context-menu-item"
        :class="{ disabled: store.tabs.length <= 1 }"
        @click="store.tabs.length > 1 && handleCloseOtherTabs()"
      >
        关闭其他标签
      </div>
    </div>
  </Teleport>
```

- [ ] **Step 3: 验证模板语法**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add context menu UI template"
```

---

## Task 7: TabBar - 修改标签模板支持右键菜单和内联编辑

**Files:**
- Modify: `src/components/TabBar.vue` (修改标签项的 template)

- [ ] **Step 1: 找到标签项模板位置**

查找 `v-for="(tab, index) in store.tabs"` 的 div 元素（约第120行附近）

- [ ] **Step 2: 添加 @contextmenu 事件**

在标签项 div 上添加 `@contextmenu` 事件：

```vue
        <div
          :key="tab.id"
          class="tab"
          :class="{ active: tab.id === store.activeTabId, dragging: dragState?.draggedTabId === tab.id }"
          :style="getTabStyle(index)"
          @click="store.switchTab(tab.id)"
          @pointerdown="handlePointerDown($event, tab.id, index)"
          @pointermove="handlePointerMove"
          @pointerup="handlePointerUp"
          @contextmenu="handleContextMenu($event, tab.id)"
        >
```

- [ ] **Step 3: 修改标签标题为条件渲染**

找到标签标题的 `<span class="tab-title">` 元素，替换为：

```vue
          <input
            v-if="editState?.editingTabId === tab.id"
            class="tab-title-input"
            :value="tab.title"
            @vue:mounted="(el: any) => el.select()"
            @keydown.enter="confirmEdit"
            @keydown.escape="cancelEdit"
            @blur="confirmEdit"
            @click.stop
          />
          <span v-else class="tab-title">{{ tab.title }}</span>
```

- [ ] **Step 4: 验证模板语法**

```bash
npx pnpm exec vue-tsc --noEmit
```

Expected: 无类型错误

- [ ] **Step 5: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): wire up context menu and inline edit to template"
```

---

## Task 8: TabBar - 添加右键菜单样式

**Files:**
- Modify: `src/components/TabBar.vue` (在 style 标签内添加)

- [ ] **Step 1: 添加右键菜单样式**

在 `<style scoped>` 标签内的末尾添加：

```css
.context-menu {
  position: fixed;
  background: #181825;
  border: 1px solid #313244;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  min-width: 160px;
  z-index: 2000;
  padding: 4px 0;
}

.context-menu-item {
  padding: 9px 14px;
  font-size: 13px;
  color: #cdd6f4;
  cursor: pointer;
  transition: background 0.1s ease;
  user-select: none;
}

.context-menu-item:hover:not(.disabled) {
  background: #313244;
}

.context-menu-item.disabled {
  color: #6c7086;
  cursor: not-allowed;
}
```

- [ ] **Step 2: 添加内联编辑输入框样式**

在右键菜单样式后添加：

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
  font-family: inherit;
}
```

- [ ] **Step 3: 验证开发服务器启动**

```bash
npx pnpm tauri dev
```

Expected: 应用启动，无编译错误

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "style(TabBar): add context menu and inline edit styles"
```

---

## Task 9: 手动测试 - 右键菜单显示

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 启动应用**

```bash
npx pnpm tauri dev
```

- [ ] **Step 2: 测试右键菜单显示**

测试步骤：
1. 右键点击标签 → 菜单在鼠标位置显示
2. 菜单包含3个选项：重命名 / 关闭标签 / 关闭其他标签
3. 菜单不被标签栏边界截断

Expected: 菜单正常显示，位置正确

- [ ] **Step 3: 测试菜单关闭**

测试步骤：
1. 右键打开菜单
2. 点击菜单外部 → 菜单关闭

Expected: 点击外部菜单消失

- [ ] **Step 4: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-context-menu.md`

---

## Task 10: 手动测试 - 重命名功能

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 测试基础重命名**

测试步骤：
1. 右键点击标签 → 点击"重命名"
2. 标题变为 input，自动聚焦并全选
3. 输入新名称 "Test Tab"
4. 按 Enter

Expected: 标题更新为 "Test Tab"

- [ ] **Step 2: 测试取消编辑**

测试步骤：
1. 右键点击标签 → 点击"重命名"
2. 输入新名称 "Cancel Test"
3. 按 Escape

Expected: 标题恢复为原标题

- [ ] **Step 3: 测试失焦确认**

测试步骤：
1. 右键点击标签 → 点击"重命名"
2. 输入新名称 "Blur Test"
3. 点击其他区域（失焦）

Expected: 标题更新为 "Blur Test"

- [ ] **Step 4: 测试空名称验证**

测试步骤：
1. 右键点击标签 → 点击"重命名"
2. 清空输入框（或输入纯空格）
3. 按 Enter

Expected: 标题恢复为原标题

- [ ] **Step 5: 测试中文和 emoji**

测试步骤：
1. 右键点击标签 → 点击"重命名"
2. 输入 "测试标签 🚀"
3. 按 Enter

Expected: 标题正常显示中文和 emoji

- [ ] **Step 6: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-rename.md`

---

## Task 11: 手动测试 - 关闭标签功能

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 测试关闭标签**

测试步骤：
1. 创建2个标签
2. 右键点击第一个标签 → 点击"关闭标签"
3. 确认对话框点击"确定"

Expected: 标签关闭，剩余1个标签

- [ ] **Step 2: 测试关闭最后一个标签**

测试步骤：
1. 只保留1个标签
2. 右键点击标签 → 点击"关闭标签"
3. 确认对话框点击"确定"

Expected: 应用退出

- [ ] **Step 3: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-close-tab.md`

---

## Task 12: 手动测试 - 关闭其他标签功能

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 测试关闭其他标签**

测试步骤：
1. 创建3个标签
2. 右键点击第二个标签 → 点击"关闭其他标签"

Expected: 只保留第二个标签，其他标签关闭

- [ ] **Step 2: 测试单标签禁用**

测试步骤：
1. 只保留1个标签
2. 右键点击标签 → 查看"关闭其他标签"选项

Expected: 选项显示为禁用状态（灰色，不可点击）

- [ ] **Step 3: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-close-others.md`

---

## Task 13: 手动测试 - 编辑与拖拽兼容性

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 测试编辑时拖拽**

测试步骤：
1. 创建2个标签
2. 右键点击第一个标签 → 点击"重命名"
3. 不输入内容，直接按住鼠标拖拽标签

Expected: 编辑取消，拖拽正常进行

- [ ] **Step 2: 测试编辑时切换标签**

测试步骤：
1. 创建2个标签
2. 右键点击第一个标签 → 点击"重命名"
3. 输入新名称 "Edit Test"
4. 点击第二个标签

Expected: 第一个标签标题更新为 "Edit Test"，切换到第二个标签

- [ ] **Step 3: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-edit-drag-compat.md`

---

## Task 14: 手动测试 - 菜单交互

**Files:**
- Test: 应用运行时手动测试

- [ ] **Step 1: 测试菜单显示时点击其他标签**

测试步骤：
1. 创建2个标签
2. 右键点击第一个标签（菜单显示）
3. 点击第二个标签

Expected: 菜单关闭，不切换标签（需要再次点击才能切换）

- [ ] **Step 2: 测试菜单项点击后关闭**

测试步骤：
1. 右键点击标签
2. 点击任意菜单项

Expected: 执行操作后菜单自动关闭

- [ ] **Step 3: 记录测试结果**

如果发现问题，记录到 `.playwright-mcp/test-menu-interaction.md`

---

## Task 15: 修复测试中发现的问题

**Files:**
- Modify: 根据测试结果修改相关文件

- [ ] **Step 1: 检查测试记录**

查看 `.playwright-mcp/test-*.md` 文件，列出所有发现的问题

- [ ] **Step 2: 逐个修复问题**

针对每个问题：
1. 分析根本原因
2. 修改代码
3. 重新测试验证

- [ ] **Step 3: 所有测试通过后 Commit**

```bash
git add src/components/TabBar.vue src/stores/terminalStore.ts
git commit -m "fix(TabBar): resolve issues found in manual testing"
```

---

## Task 16: 更新项目记忆

**Files:**
- Modify: `C:\Users\liu\.claude\projects\E--claudecode-lumi-term\memory\project_lumi_term_status.md`

- [ ] **Step 1: 更新项目状态**

将"标签重命名功能"状态从"设计完成，待实现"更新为"已完成并测试通过 ✅"

- [ ] **Step 2: 添加实现细节**

记录：
- 实现文件：`src/stores/terminalStore.ts` (renameTab, closeOtherTabs)、`src/components/TabBar.vue` (右键菜单、内联编辑)
- 技术栈：Vue 3 Teleport、contextmenu 事件、条件渲染
- 测试通过的场景数量

- [ ] **Step 3: 更新路线图**

将路线图中的"标签重命名"标记为 ✅，"标签颜色标记"标记为下一个待设计功能

---

## Self-Review Checklist

**Spec Coverage:**
- ✅ 右键菜单触发 (Task 4, 7)
- ✅ 内联编辑模式 (Task 5, 7)
- ✅ 重命名功能 (Task 1, 5)
- ✅ 关闭标签功能 (Task 4)
- ✅ 关闭其他标签功能 (Task 2, 4)
- ✅ 菜单样式和定位 (Task 6, 8)
- ✅ 验证规则（空名称） (Task 1, 5)
- ✅ 边界处理（单标签禁用、编辑时拖拽） (Task 5, 6, 13)
- ✅ 手动测试所有场景 (Task 9-14)

**No Placeholders:**
- ✅ 所有代码块完整
- ✅ 所有文件路径精确
- ✅ 所有测试步骤具体
- ✅ 所有命令可执行

**Type Consistency:**
- ✅ `ContextMenuState` 接口在 Task 3 定义，Task 4-7 使用
- ✅ `EditState` 接口在 Task 3 定义，Task 5-7 使用
- ✅ `renameTab(tabId, newTitle)` 签名在 Task 1 定义，Task 5 调用
- ✅ `closeOtherTabs(keepTabId)` 签名在 Task 2 定义，Task 4 调用
- ✅ 所有方法名、属性名在各任务中一致
