# Workspace Sidebar 修复计划

**生成时间**: 2026-05-06  
**代码审查评分**: 7.5/10  
**总问题数**: 14 个（P0: 3, P1: 5, P2: 6）

---

## 🔴 P0 - 关键问题（必须修复）

### 1. 安全漏洞：路径遍历攻击风险

**严重程度**: 🔴 Critical  
**影响范围**: 文件系统安全  
**预估工作量**: 2-3 小时

**问题描述**:
`src-tauri/src/services/pty_service.rs` 中的 `rename_path`、`create_file`、`create_folder` 函数未验证用户输入的文件名，攻击者可以通过包含 `../` 的文件名进行路径遍历攻击，访问或修改工作区外的文件。

**受影响的函数**:
- `rename_path` (line 336-348)
- `create_file` (line 285-297)
- `create_folder` (line 299-311)

**修复方案**:
```rust
// 添加文件名验证函数
fn validate_filename(name: &str) -> Result<&str, String> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("文件名不能为空".to_string());
    }
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err("文件名不能包含路径分隔符".to_string());
    }
    if trimmed.starts_with('.') && (trimmed == "." || trimmed == "..") {
        return Err("文件名不能是 . 或 ..".to_string());
    }
    Ok(trimmed)
}

// 在每个函数中调用验证
pub fn rename_path(old_path: &str, new_name: &str) -> Result<String, String> {
    let validated_name = validate_filename(new_name)?;
    // ... 其余逻辑
}
```

**测试计划**:
- [ ] 测试正常文件名（`test.txt`）
- [ ] 测试包含 `../` 的文件名（应该被拒绝）
- [ ] 测试包含 `\` 的文件名（应该被拒绝）
- [ ] 测试 `.` 和 `..` 文件名（应该被拒绝）
- [ ] 测试空文件名（应该被拒绝）

**依赖**: 无

---

### 2. 竞态条件：并发打开同一文件

**严重程度**: 🔴 High  
**影响范围**: 用户体验、状态一致性  
**预估工作量**: 1-2 小时

**问题描述**:
`src/stores/editorStore.ts:53-62` 中，`openFile` 函数在检查 `files.value` 和设置 `pendingOpens` 之间存在竞态窗口。如果两个调用同时通过第一个检查，会创建两个加载中的标签页。

**修复方案**:
```typescript
async function openFile(path: string): Promise<EditorFile | null> {
    // 先检查 pending，再检查 existing
    const pendingOpen = pendingOpens.get(path);
    if (pendingOpen) return pendingOpen;

    const existing = files.value.find((file) => file.path === path);
    if (existing) {
        activePath.value = existing.path;
        openError.value = '';
        return existing;
    }

    // 立即设置 pending，防止竞态
    const request = (async () => {
        // ... 加载逻辑
    })();
    
    pendingOpens.set(path, request);
    return request;
}
```

**测试计划**:
- [ ] 单元测试：快速连续调用 `openFile` 两次
- [ ] 验证只创建一个文件标签页
- [ ] 验证 `pendingOpens` 正确清理

**依赖**: 无

---

### 3. 内存泄漏：pendingOpens Map 清理

**严重程度**: 🟡 Medium  
**影响范围**: 内存使用  
**预估工作量**: 30 分钟

**问题描述**:
虽然当前代码在 `finally` 块中清理 `pendingOpens`，但需要确保所有错误路径都执行到。建议添加注释说明清理逻辑。

**修复方案**:
```typescript
// 在 openFile 函数顶部添加注释
/**
 * 打开文件并加载内容
 * 
 * 注意：pendingOpens Map 用于防止重复加载同一文件
 * 必须在 finally 块中清理，确保所有错误路径都执行
 */
async function openFile(path: string): Promise<EditorFile | null> {
    // ... 现有逻辑
}
```

**测试计划**:
- [ ] 代码审查：确认所有错误路径都有 `finally` 清理
- [ ] 单元测试：模拟加载失败，验证 `pendingOpens` 被清理

**依赖**: 无

---

## 🟡 P1 - 重要问题（应该修复）

### 4. 性能问题：文件树递归展开无节流

**严重程度**: 🟡 Medium  
**影响范围**: 性能、用户体验  
**预估工作量**: 2-3 小时

**问题描述**:
`src/components/FileTreeNode.vue:49-67` 中，用户快速点击多个文件夹时，会同时发起多个 `list_directory` 请求。大型项目中可能导致性能问题。

**修复方案**:
```typescript
// 添加全局请求队列
const pendingRequests = new Map<string, Promise<FileEntry[]>>();

const toggle = async () => {
    if (renaming.value) return;
    if (props.entry.kind !== 'folder') return;
    if (expanded.value) {
        expanded.value = false;
        return;
    }
    
    // 检查是否已有请求
    const pending = pendingRequests.get(props.entry.path);
    if (pending) {
        children.value = await pending;
        expanded.value = true;
        return;
    }
    
    if (children.value.length === 0) {
        loading.value = true;
        try {
            const request = invoke<FileEntry[]>('list_directory', { 
                path: props.entry.path 
            });
            pendingRequests.set(props.entry.path, request);
            children.value = await request;
        } catch (e) {
            alert(String(e));
        } finally {
            loading.value = false;
            pendingRequests.delete(props.entry.path);
        }
    }
    expanded.value = true;
};
```

**测试计划**:
- [ ] 手动测试：快速点击多个文件夹
- [ ] 验证不会发起重复请求
- [ ] 性能测试：大型项目（1000+ 文件）

**依赖**: 无

---

### 5. 用户体验：替换 window.confirm

**严重程度**: 🟡 Medium  
**影响范围**: 用户体验  
**预估工作量**: 3-4 小时

**问题描述**:
`src/stores/editorStore.ts:152-154` 使用 `window.confirm` 阻塞式对话框，用户体验差。

**修复方案**:
1. 创建 Vue 组件 `ConfirmDialog.vue`
2. 使用 Pinia store 管理对话框状态
3. 返回 Promise 以支持 async/await

```vue
<!-- src/components/ConfirmDialog.vue -->
<script setup lang="ts">
import { ref } from 'vue';

const visible = ref(false);
const title = ref('');
const message = ref('');
let resolvePromise: ((value: boolean) => void) | null = null;

function show(t: string, m: string): Promise<boolean> {
    title.value = t;
    message.value = m;
    visible.value = true;
    return new Promise((resolve) => {
        resolvePromise = resolve;
    });
}

function confirm() {
    visible.value = false;
    resolvePromise?.(true);
}

function cancel() {
    visible.value = false;
    resolvePromise?.(false);
}

defineExpose({ show });
</script>
```

**测试计划**:
- [ ] 单元测试：对话框显示/隐藏
- [ ] 集成测试：关闭脏文件流程
- [ ] 键盘测试：Enter 确认、Escape 取消

**依赖**: 无

---

### 6. 错误处理：替换 alert()

**严重程度**: 🟡 Medium  
**影响范围**: 用户体验  
**预估工作量**: 2-3 小时

**问题描述**:
多处使用 `alert()` 显示错误，应该使用 Toast 通知。

**修复方案**:
1. 安装 Toast 库（如 `vue-toastification`）
2. 创建全局 Toast 实例
3. 替换所有 `alert()` 调用

```typescript
// src/utils/toast.ts
import { useToast } from 'vue-toastification';

const toast = useToast();

export function showError(message: string) {
    toast.error(message, {
        timeout: 5000,
        closeOnClick: true,
        pauseOnHover: true,
    });
}

export function showSuccess(message: string) {
    toast.success(message, { timeout: 3000 });
}
```

**测试计划**:
- [ ] 手动测试：触发各种错误
- [ ] 验证 Toast 显示正确
- [ ] 验证自动关闭

**依赖**: 需要安装 `vue-toastification`

---

### 7. 可访问性：完善键盘导航

**严重程度**: 🟡 Low  
**影响范围**: 可访问性  
**预估工作量**: 2-3 小时

**问题描述**:
`src/components/SidebarPanel.vue:204-219` 键盘导航不完整，缺少 Escape、Tab 等常见操作。

**修复方案**:
```typescript
const handleWorkspaceBrowserKeydown = (event: KeyboardEvent) => {
    switch (event.key) {
        case 'ArrowDown':
            event.preventDefault();
            moveWorkspaceSelection(1);
            break;
        case 'ArrowUp':
            event.preventDefault();
            moveWorkspaceSelection(-1);
            break;
        case 'Enter':
            event.preventDefault();
            if (selectedWorkspaceIndex.value >= 0) {
                const workspace = recentWorkspaces.value[selectedWorkspaceIndex.value];
                setCurrentWorkspace(workspace);
                showWorkspaceBrowser.value = false;
            }
            break;
        case 'Escape':
            event.preventDefault();
            showWorkspaceBrowser.value = false;
            break;
        case 'Tab':
            // 允许 Tab 键切换焦点
            break;
        default:
            break;
    }
};
```

**测试计划**:
- [ ] 键盘测试：所有快捷键
- [ ] 屏幕阅读器测试
- [ ] Tab 顺序测试

**依赖**: 无

---

### 8. 状态管理：工作区切换时处理编辑器

**严重程度**: 🟡 Medium  
**影响范围**: 用户体验、数据一致性  
**预估工作量**: 2-3 小时

**问题描述**:
切换工作区时，编辑器中打开的文件可能属于旧工作区，但没有被关闭或提示用户。

**修复方案**:
```typescript
function setCurrentWorkspace(path: string) {
    const normalized = normalizePath(path);
    if (!normalized) return;
    
    // 检查是否有打开的文件
    const editorStore = useEditorStore();
    if (editorStore.files.length > 0) {
        // 提示用户
        const shouldClose = confirm(
            `切换工作区将关闭所有打开的文件。是否继续？`
        );
        if (!shouldClose) return;
        
        // 关闭所有文件
        editorStore.closeAll();
    }
    
    currentWorkspacePath.value = normalized;
    addRecentWorkspace(normalized);
    
    // 发送 cd 命令到终端
    // ...
}
```

**测试计划**:
- [ ] 测试：打开文件后切换工作区
- [ ] 验证提示对话框显示
- [ ] 验证文件被正确关闭

**依赖**: 依赖问题 #5（替换 confirm）

---

## 🟢 P2 - 改进建议（可选）

### 9. 代码重复：统一路径规范化

**严重程度**: 🟢 Low  
**影响范围**: 代码维护性  
**预估工作量**: 1-2 小时

**问题描述**:
前端和后端都有路径规范化逻辑，但实现不一致。

**修复方案**:
统一在后端处理路径规范化，前端只负责调用。

**依赖**: 无

---

### 10. 测试覆盖：添加集成测试

**严重程度**: 🟢 Low  
**影响范围**: 测试覆盖率  
**预估工作量**: 4-6 小时

**问题描述**:
缺少端到端测试验证完整用户流程。

**修复方案**:
使用 Playwright 或 Tauri 测试框架添加 E2E 测试。

**测试场景**:
- [ ] 文件树展开 → 双击文件 → 编辑器打开
- [ ] 编辑文件 → 保存 → 文件系统更新
- [ ] 工作区切换 → 文件树刷新 → 终端 cd

**依赖**: 需要配置测试环境

---

### 11. 性能优化：文件树虚拟滚动

**严重程度**: 🟢 Low  
**影响范围**: 性能  
**预估工作量**: 4-6 小时

**问题描述**:
大型项目中，文件树可能有数千个节点，当前实现会渲染所有节点。

**修复方案**:
使用虚拟滚动库（如 `vue-virtual-scroller`）。

**依赖**: 需要安装依赖

---

### 12. 代码质量：配置化魔法数字

**严重程度**: 🟢 Low  
**影响范围**: 代码维护性  
**预估工作量**: 1 小时

**问题描述**:
`src-tauri/src/services/pty_service.rs` 中的常量应该可配置。

**修复方案**:
添加配置文件或环境变量支持。

**依赖**: 无

---

### 13. 用户体验：使用 SVG 图标

**严重程度**: 🟢 Low  
**影响范围**: 视觉一致性  
**预估工作量**: 2-3 小时

**问题描述**:
使用 emoji 作为文件图标，在不同操作系统上显示效果不一致。

**修复方案**:
使用 SVG 图标库（如 `lucide-vue-next`）。

**依赖**: 需要安装依赖

---

### 14. 错误处理：添加错误边界

**严重程度**: 🟢 Low  
**影响范围**: 稳定性  
**预估工作量**: 2-3 小时

**问题描述**:
如果组件渲染时抛出错误，会导致整个侧边栏崩溃。

**修复方案**:
添加 Vue 错误边界组件。

**依赖**: 无

---

## 📊 修复优先级建议

### 第一阶段（本周）- 安全和关键问题
1. ✅ 问题 #1：路径遍历攻击（P0）
2. ✅ 问题 #2：并发打开文件（P0）
3. ✅ 问题 #3：内存泄漏注释（P0）

**预估总工作量**: 4-6 小时

### 第二阶段（下周）- 用户体验改进
4. ✅ 问题 #5：替换 window.confirm（P1）
5. ✅ 问题 #6：替换 alert()（P1）
6. ✅ 问题 #4：文件树节流（P1）

**预估总工作量**: 7-10 小时

### 第三阶段（下下周）- 完善和优化
7. ✅ 问题 #8：工作区切换处理（P1）
8. ✅ 问题 #7：键盘导航（P1）
9. ✅ 问题 #10：集成测试（P2）

**预估总工作量**: 8-12 小时

### 第四阶段（未来）- 长期改进
10. 问题 #9-14：代码质量和性能优化（P2）

**预估总工作量**: 14-20 小时

---

## 🎯 下一步行动

**建议立即开始**：
1. 修复问题 #1（路径遍历攻击）- 这是最紧急的安全问题
2. 修复问题 #2（并发打开文件）- 影响用户体验

**需要的准备工作**：
- [ ] 创建测试分支
- [ ] 设置测试环境
- [ ] 准备测试数据（大型项目目录）

**风险评估**：
- 问题 #1 修复可能影响现有文件操作功能，需要充分测试
- 问题 #5、#6 需要引入新的 UI 组件，可能影响整体样式

---

**文档版本**: v1.0  
**最后更新**: 2026-05-06
