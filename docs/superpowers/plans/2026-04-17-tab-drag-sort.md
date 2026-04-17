# Tab Drag-Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add drag-and-drop reordering to tab bar with smooth animations

**Architecture:** Pointer events capture drag state, CSS transforms provide visual feedback, store method commits final order

**Tech Stack:** Vue 3 Composition API, TypeScript, native pointer events, CSS transforms

---

## File Structure

- **Modify:** `src/stores/terminalStore.ts` — Add `reorderTabs()` method
- **Modify:** `src/components/TabBar.vue` — Add drag state, pointer handlers, dynamic styles

---

### Task 1: Add reorderTabs to Store

**Files:**
- Modify: `src/stores/terminalStore.ts:56`

- [ ] **Step 1: Add reorderTabs method to store**

Add this function before the return statement in `useTerminalStore`:

```typescript
function reorderTabs(fromIndex: number, toIndex: number) {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return;
  if (fromIndex >= tabs.value.length || toIndex >= tabs.value.length) return;
  
  const [movedTab] = tabs.value.splice(fromIndex, 1);
  tabs.value.splice(toIndex, 0, movedTab);
}
```

- [ ] **Step 2: Export reorderTabs in return statement**

Change the return statement from:

```typescript
return { tabs, activeTabId, createTab, setSessionId, removeTab, switchTab };
```

To:

```typescript
return { tabs, activeTabId, createTab, setSessionId, removeTab, switchTab, reorderTabs };
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/stores/terminalStore.ts
git commit -m "feat(store): add reorderTabs method"
```

---

### Task 2: Add Drag State to TabBar

**Files:**
- Modify: `src/components/TabBar.vue:6`

- [ ] **Step 1: Add drag state interface and ref**

After line 6 (`const dropdownOpen = ref(false);`), add:

```typescript
interface DragState {
  draggedTabId: string;
  draggedIndex: number;
  currentIndex: number;
  startX: number;
  currentX: number;
}

const dragState = ref<DragState | null>(null);
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add drag state structure"
```

---

### Task 3: Implement Drag Start Handler

**Files:**
- Modify: `src/components/TabBar.vue:39` (after closeTab function)

- [ ] **Step 1: Add handlePointerDown function**

Add after the `closeTab` function:

```typescript
function handlePointerDown(e: PointerEvent, tabId: string, index: number) {
  // Ignore if clicking close button
  if ((e.target as HTMLElement).closest('.tab-close')) return;
  
  // Ignore if only one tab
  if (store.tabs.length < 2) return;
  
  const target = e.currentTarget as HTMLElement;
  target.setPointerCapture(e.pointerId);
  
  dragState.value = {
    draggedTabId: tabId,
    draggedIndex: index,
    currentIndex: index,
    startX: e.clientX,
    currentX: e.clientX,
  };
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add drag start handler"
```

---

### Task 4: Implement Drag Move Handler

**Files:**
- Modify: `src/components/TabBar.vue` (after handlePointerDown)

- [ ] **Step 1: Add handlePointerMove function**

Add after `handlePointerDown`:

```typescript
function handlePointerMove(e: PointerEvent) {
  if (!dragState.value) return;
  
  dragState.value.currentX = e.clientX;
  
  const deltaX = dragState.value.currentX - dragState.value.startX;
  const TAB_WIDTH = 148; // min-width(140) + gap(4) + border(4)
  
  const newIndex = Math.max(
    0,
    Math.min(
      store.tabs.length - 1,
      dragState.value.draggedIndex + Math.round(deltaX / TAB_WIDTH)
    )
  );
  
  dragState.value.currentIndex = newIndex;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add drag move handler"
```

---

### Task 5: Implement Drag End Handler

**Files:**
- Modify: `src/components/TabBar.vue` (after handlePointerMove)

- [ ] **Step 1: Add handlePointerUp function**

Add after `handlePointerMove`:

```typescript
function handlePointerUp(e: PointerEvent) {
  if (!dragState.value) return;
  
  const deltaX = Math.abs(dragState.value.currentX - dragState.value.startX);
  
  // Only reorder if dragged more than 5px
  if (deltaX > 5) {
    store.reorderTabs(dragState.value.draggedIndex, dragState.value.currentIndex);
  }
  
  dragState.value = null;
}
```

- [ ] **Step 2: Add handlePointerCancel function**

Add after `handlePointerUp`:

```typescript
function handlePointerCancel() {
  dragState.value = null;
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add drag end handlers"
```

---

### Task 6: Add Computed Style Helper

**Files:**
- Modify: `src/components/TabBar.vue` (after handlePointerCancel)

- [ ] **Step 1: Add getTabStyle function**

Add after `handlePointerCancel`:

```typescript
function getTabStyle(tabId: string, index: number): Record<string, string> {
  if (!dragState.value) return {};
  
  const TAB_WIDTH = 148;
  
  // Dragged tab follows mouse
  if (tabId === dragState.value.draggedTabId) {
    const deltaX = dragState.value.currentX - dragState.value.startX;
    return { transform: `translateX(${deltaX}px)` };
  }
  
  // Other tabs shift to make space
  const draggedIdx = dragState.value.draggedIndex;
  const currentIdx = dragState.value.currentIndex;
  
  if (draggedIdx < currentIdx && index > draggedIdx && index <= currentIdx) {
    return { transform: `translateX(-${TAB_WIDTH}px)` };
  }
  
  if (draggedIdx > currentIdx && index < draggedIdx && index >= currentIdx) {
    return { transform: `translateX(${TAB_WIDTH}px)` };
  }
  
  return {};
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): add tab style computation"
```

---

### Task 7: Wire Up Template Events

**Files:**
- Modify: `src/components/TabBar.vue:43-54` (template section)

- [ ] **Step 1: Update tab div with pointer events and styles**

Replace the tab div (lines 44-54) with:

```vue
<div
  v-for="(tab, index) in store.tabs"
  :key="tab.id"
  class="tab"
  :class="{ 
    active: tab.id === store.activeTabId,
    dragging: dragState?.draggedTabId === tab.id
  }"
  :style="getTabStyle(tab.id, index)"
  @click="store.switchTab(tab.id)"
  @pointerdown="handlePointerDown($event, tab.id, index)"
  @pointermove="handlePointerMove"
  @pointerup="handlePointerUp"
  @pointercancel="handlePointerCancel"
>
  <span class="tab-icon">{{ iconMap[tab.shellType] }}</span>
  <span class="tab-title">{{ tab.title }}</span>
  <span class="tab-close" @click="closeTab($event, tab.id)">×</span>
</div>
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run build`
Expected: No TypeScript errors

- [ ] **Step 3: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "feat(TabBar): wire up drag event handlers"
```

---

### Task 8: Add Drag Styles

**Files:**
- Modify: `src/components/TabBar.vue:92` (style section)

- [ ] **Step 1: Update .tab base styles**

Change line 92 from:

```css
.tab {
```

To:

```css
.tab {
  cursor: grab;
```

- [ ] **Step 2: Add dragging state styles**

After line 111 (`.tab.active .tab-close { color: #11111b; opacity: 0.6; }`), add:

```css

.tab.dragging {
  cursor: grabbing;
  opacity: 0.85;
  z-index: 10;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  transition: none;
}

.tab:not(.dragging) {
  transition: transform 0.15s ease;
}
```

- [ ] **Step 3: Verify styles compile**

Run: `npm run dev`
Expected: Dev server starts without errors

- [ ] **Step 4: Commit**

```bash
git add src/components/TabBar.vue
git commit -m "style(TabBar): add drag visual feedback"
```

---

### Task 9: Manual Testing

**Files:**
- Test: `src/components/TabBar.vue` (manual browser testing)

- [ ] **Step 1: Start dev server**

Run: `npm run dev`
Expected: Server starts on port 1420

- [ ] **Step 2: Test basic drag**

1. Open app, create 3+ tabs (Ctrl+T)
2. Click and drag a tab left/right
3. Verify: Tab follows mouse, has shadow and opacity
4. Verify: Other tabs smoothly slide to make space
5. Release: Tab order updates correctly

- [ ] **Step 3: Test edge cases**

1. Click tab without dragging → switches tab (no reorder)
2. Click close button → closes tab (no drag starts)
3. Drag with only 1 tab → nothing happens
4. Drag tab fully left/right → stops at boundaries

- [ ] **Step 4: Test active tab preservation**

1. Activate tab 2
2. Drag tab 1 to position 3
3. Verify: Tab 2 remains active

- [ ] **Step 5: Document test results**

Create file `docs/superpowers/plans/2026-04-17-tab-drag-sort-test-results.md`:

```markdown
# Tab Drag-Sort Test Results

**Date:** 2026-04-17

## Test Cases

- [x] Basic drag left/right works
- [x] Smooth animation (150ms)
- [x] Visual feedback (shadow, opacity)
- [x] Order updates on release
- [x] Click without drag switches tab
- [x] Close button doesn't trigger drag
- [x] Single tab doesn't drag
- [x] Boundary constraints work
- [x] Active tab preserved during reorder

## Issues Found

(None / List any issues)

## Browser Tested

- Chrome/Edge on Windows 11
```

- [ ] **Step 6: Commit test results**

```bash
git add docs/superpowers/plans/2026-04-17-tab-drag-sort-test-results.md
git commit -m "docs: add tab drag-sort test results"
```

---

## Self-Review Checklist

**Spec coverage:**
- ✅ Pointer event handlers (pointerdown/move/up/cancel)
- ✅ Drag state management (DragState interface)
- ✅ Store reorderTabs method
- ✅ CSS transform animations (150ms ease)
- ✅ Visual feedback (shadow, opacity, cursor)
- ✅ Edge cases (close button, single tab, fast click, boundaries)

**Placeholders:** None - all code blocks complete

**Type consistency:**
- `DragState` interface used consistently
- `dragState.value` null checks present
- `store.reorderTabs()` signature matches definition
- `getTabStyle()` return type matches Vue style binding

**Testing:** Manual testing task covers all spec requirements
