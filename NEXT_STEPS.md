# LumiTerm 下一步实施计划

**记录时间：** 2026-05-06  
**当前状态：** 已完成详细实现计划，准备开始实施

---

## 已完成的工作

1. ✅ 深入研究了 Warp Terminal 的设计理念和核心功能
2. ✅ 创建了 Command Blocks 和现代输入编辑器的详细实现计划
3. ✅ 计划文档已保存：`~/.gstack/projects/Southertly-lumi-term/2026-05-06-command-blocks-modern-input-plan.md`

## 核心决策

### 功能优先级
**先实现 Command Blocks，再实现现代输入编辑器**

**理由：**
- Command Blocks 是架构基础，需要在 PTY 层建立命令边界检测机制
- 用户价值更直接（复制、重执行、清晰的视觉边界）
- 现代输入编辑器依赖 Command Blocks 的状态系统

### 技术方案
- **Command Blocks**：使用 OSC 133 序列（VS Code 标准）检测命令边界
- **输入编辑器**：选择 CodeMirror 6（轻量、灵活，~200KB）
- **架构**：Overlay 架构，Vue 组件层叠加在 xterm.js 上方

---

## 下一步：开始实施 Phase 1

### Phase 1: Command Blocks 基础架构（预计 1-2 周）

#### 任务 1.1：Rust 后端 - PowerShell Prompt Hook 注入

**文件：** `src-tauri/src/services/pty_service.rs`

**要做的事：**
1. 修改 `build_shell_command()` 函数
2. 在 PowerShell 启动参数中注入 prompt hook
3. 添加 OSC 133 序列支持：
   - `\x1b]133;A\x1b\\` - Prompt 开始
   - `\x1b]133;B\x1b\\` - 输入区域开始
   - `\x1b]133;C\x1b\\` - 命令执行开始
   - `\x1b]133;D;exitCode\x1b\\` - 命令执行结束

**参考代码：**
```rust
let prompt_hook = r#"
$global:_lumi_prompt_orig = $function:prompt;
function global:prompt {
    Write-Host "`e]133;A`e\" -NoNewline;
    $result = if ($global:_lumi_prompt_orig) { & $global:_lumi_prompt_orig } else { "PS> " };
    Write-Host "`e]133;B`e\" -NoNewline;
    return $result;
}
"#;
```

#### 任务 1.2：Frontend - OSC 序列解析器

**文件：** `src/utils/oscParser.ts`

**要做的事：**
1. 创建 OSC 序列解析器
2. 从 xterm.js 输出流中提取命令边界标记
3. 返回清理后的数据和序列列表

**接口设计：**
```typescript
export interface OscSequence {
  type: 'prompt_start' | 'input_start' | 'exec_start' | 'exec_end';
  exitCode?: number;
  timestamp: number;
}

export function parseOscSequences(data: string): {
  cleanData: string;
  sequences: OscSequence[];
}
```

#### 任务 1.3：Pinia Store - Command Block 状态管理

**文件：** `src/stores/commandBlockStore.ts`

**要做的事：**
1. 创建 Block 数据结构
2. 实现 Block 生命周期管理（start, append, end）
3. 持久化到 localStorage

**数据结构：**
```typescript
interface Block {
  id: string;
  command: string;
  output: string;
  status: 'running' | 'success' | 'error';
  exitCode?: number;
  startTime: number;
  endTime?: number;
  bookmarked: boolean;
  collapsed: boolean;
}
```

#### 任务 1.4：Vue 组件 - 基础 Block 渲染

**文件：** `src/components/CommandBlock.vue`

**要做的事：**
1. 渲染单个 Block（命令 + 输出 + 状态）
2. 基础样式（参考 Warp 设计）
3. 状态图标（✓ 成功、✗ 失败、⏳ 运行中）

---

## 实施建议

### 开发顺序
1. **先做后端**：Rust PTY 服务注入 OSC 序列
2. **再做解析**：Frontend 解析 OSC 序列
3. **然后状态**：Pinia Store 管理 Block 状态
4. **最后渲染**：Vue 组件显示 Block

### 测试策略
每完成一个任务，立即测试：
- 任务 1.1：在终端中运行命令，检查是否输出 OSC 序列
- 任务 1.2：解析 OSC 序列，验证提取正确
- 任务 1.3：创建 Block，验证状态变化
- 任务 1.4：渲染 Block，验证视觉效果

### 风险提示
- **PowerShell 版本差异**：需要兼容 Windows PowerShell 5.1 和 PowerShell 7+
- **性能问题**：大量 Block 可能导致渲染卡顿，需要虚拟滚动
- **OSC 序列解析**：高频输出时需要批量解析（100ms 缓冲）

---

## 参考资料

- **详细计划**：`~/.gstack/projects/Southertly-lumi-term/2026-05-06-command-blocks-modern-input-plan.md`
- **Warp Terminal**：https://github.com/warpdotdev/Warp
- **OSC 133 规范**：https://code.visualstudio.com/docs/terminal/shell-integration
- **CodeMirror 6**：https://codemirror.net/docs/
- **xterm.js API**：https://xtermjs.org/docs/api/terminal/

---

## 快速启动命令

```bash
# 查看完整计划
cat ~/.gstack/projects/Southertly-lumi-term/2026-05-06-command-blocks-modern-input-plan.md

# 启动开发环境
cd /e/claudecode/lumi-term
npx pnpm tauri dev

# 运行测试
npx pnpm test
```

---

**下次开始时，直接从 Phase 1 任务 1.1 开始实施！**
