# Command Blocks 手动测试清单

## 测试环境
- **分支**: main
- **功能**: Command Blocks Phase 1
- **测试日期**: 2026-05-08

## 测试步骤

### 1. 基础功能测试

#### 1.1 成功命令（退出码 0）
```powershell
echo hello
```
**预期结果**:
- ✅ 出现一个 command block
- ✅ 左侧边框为绿色
- ✅ 状态图标显示 ✓
- ✅ 显示命令文本 "echo hello"
- ✅ 显示输出 "hello"
- ✅ 显示执行时长（例如 "50ms" 或 "0.1s"）

#### 1.2 失败命令（退出码非 0）
```powershell
nonexistent-command
```
**预期结果**:
- ✅ 出现一个 command block
- ✅ 左侧边框为红色
- ✅ 状态图标显示 ✗
- ✅ 显示错误输出

#### 1.3 长输出命令
```powershell
Get-ChildItem -Recurse
```
