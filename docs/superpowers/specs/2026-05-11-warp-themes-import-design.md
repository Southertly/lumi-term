# Warp Themes 导入与毛玻璃效果 — 设计文档

**日期：** 2026-05-11  
**状态：** 待实现  
**方案：** 构建时预处理 + 全局毛玻璃开关

---

## 背景

LumiTerm 当前内置 6 个主题。用户希望从 Warp Themes 仓库（https://github.com/warpdotdev/themes）导入更多流行主题，并为所有主题添加可选的毛玻璃效果。

---

## 目标

1. 从 Warp Themes 仓库导入 9 个新主题（总计 15 个主题）
2. 为所有主题添加可选的毛玻璃效果（backdrop-filter）
3. 在设置界面提供毛玻璃效果开关

---

## 范围

**包含：**
- 构建时脚本：从 Warp GitHub 下载 9 个主题 YAML 文件
- 主题转换器：将 Warp YAML 格式转换为 LumiTerm `AppTheme` 格式
- 重构 `themeStore.ts`：拆分主题定义到独立文件，添加毛玻璃效果状态
- 扩展 `SettingsModal.vue`：在主题标签页添加"毛玻璃效果"开关
- CSS 支持：通过 `backdrop-filter` 实现毛玻璃效果
- Tauri 窗口配置：启用透明窗口支持

**不包含：**
- 运行时动态加载主题
- 用户自定义主题编辑器
- 主题预览图生成
- 背景图片支持

---

## 主题列表

### 已有主题（6 个）
1. Warp Dark
2. Catppuccin Mocha
3. Catppuccin Latte
4. Dracula
5. Tokyo Night
6. Nord

### 新增主题（9 个）
7. Gruvbox Dark
8. Gruvbox Light
9. Solarized Dark
10. Solarized Light
11. One Dark
12. Monokai
13. Ayu Dark
14. Ayu Light
15. GitHub Dark

---

## 技术方案

### 方案选择：构建时预处理（方案 B）

**理由：**
- LumiTerm 是桌面应用，5-10KB 体积增加可接受
- 离线可用性对终端应用很重要
- 实现最简单，维护成本低
- 主题更新频率不高，构建时更新即可

---

## 架构设计

### 文件结构

```
src/
├── stores/
│   └── themeStore.ts          # 修改：添加 glassEffectEnabled 状态
├── themes/                     # 新建目录
│   ├── builtin.ts             # 新建：当前 6 个内置主题
│   ├── warp-imported.ts       # 新建：脚本生成的 9 个主题
│   └── index.ts               # 新建：导出所有主题
├── components/
│   └── SettingsModal.vue      # 修改：添加毛玻璃开关
└── App.vue                    # 修改：应用毛玻璃 CSS 类

scripts/
└── import-warp-themes.js      # 新建：主题导入脚本

src-tauri/
└── tauri.conf.json            # 修改：启用透明窗口

package.json                   # 修改：添加 js-yaml 依赖
```

### 数据流

```
Warp GitHub YAML
    ↓
scripts/import-warp-themes.js (下载 + 解析)
    ↓
主题转换器 (YAML → AppTheme)
    ↓
src/themes/warp-imported.ts (生成 TypeScript)
    ↓
themeStore.ts (加载所有主题)
    ↓
SettingsModal.vue (用户选择)
```

---

## 主题格式转换

### Warp YAML 格式

```yaml
accent: "#bd93f9"
background: "#282a36"
foreground: "#f8f8f2"
details: darker
terminal_colors:
  normal:
    black: "#000000"
    red: "#ff5555"
    green: "#50fa7b"
    yellow: "#f1fa8c"
    blue: "#bd93f9"
    magenta: "#ff79c6"
    cyan: "#8be9fd"
    white: "#bbbbbb"
  bright:
    black: "#555555"
    red: "#ff5555"
    green: "#50fa7b"
    yellow: "#f1fa8c"
    blue: "#caa9fa"
    magenta: "#ff79c6"
    cyan: "#8be9fd"
    white: "#ffffff"
```

### LumiTerm AppTheme 格式

```typescript
interface AppTheme {
  name: string;
  label: string;
  ui: {
    bg: string;
    bgLight: string;
    bgLighter: string;
    menuBg: string;
    menuBorder: string;
    menuHover: string;
    fg: string;
    fgMuted: string;
    accent: string;
    border: string;
    hover: string;
  };
  terminal: TerminalTheme;
}
```

### 转换规则

**UI 颜色推导：**
- `ui.bg` ← Warp `background`
- `ui.bgLight` ← `background` 亮度 +5%
- `ui.bgLighter` ← `background` 亮度 +15%
- `ui.menuBg` ← `background` 亮度 +8%
- `ui.menuBorder` ← 根据 `details` (darker/lighter) 推导
- `ui.menuHover` ← `background` 亮度 +10%
- `ui.fg` ← Warp `foreground`
- `ui.fgMuted` ← `foreground` 亮度 -20%
- `ui.accent` ← Warp `accent`
- `ui.border` ← 根据 `details` 推导
- `ui.hover` ← `background` 亮度 +12%

**终端颜色直接映射：**
- `terminal.background` ← Warp `background`
- `terminal.foreground` ← Warp `foreground`
- `terminal.cursor` ← Warp `accent`
- `terminal.cursorAccent` ← Warp `background`
- `terminal.selectionBackground` ← `background` 亮度 +15%
- 16 色直接从 `terminal_colors.normal` 和 `terminal_colors.bright` 映射

**颜色亮度调整算法：**
使用 HSL 色彩空间，调整 L (Lightness) 值：
- 深色主题 (`details: darker`)：增加亮度时 L += 5-15%
- 浅色主题 (`details: lighter`)：减少亮度时 L -= 5-15%

---

## 毛玻璃效果实现

### 状态管理

**themeStore.ts 扩展：**

```typescript
export const useThemeStore = defineStore('theme', () => {
  const currentName = ref(themes[0].name);
  const glassEffectEnabled = ref(false);  // 新增

  function toggleGlassEffect() {
    glassEffectEnabled.value = !glassEffectEnabled.value;
  }

  // 持久化毛玻璃状态
  watch(glassEffectEnabled, (enabled) => {
    try {
      localStorage.setItem('lumiterm_glass_effect', String(enabled));
    } catch { /* */ }
  });

  // 加载持久化状态
  try {
    const saved = localStorage.getItem('lumiterm_glass_effect');
    if (saved !== null) {
      glassEffectEnabled.value = saved === 'true';
    }
  } catch { /* */ }

  return {
    currentName,
    glassEffectEnabled,
    toggleGlassEffect,
    getCurrentTheme,
    setTheme,
    getAllThemes,
  };
});
```

### CSS 实现

**App.vue 样式扩展：**

```css
/* 毛玻璃效果 */
.app-container.glass-effect {
  background: rgba(var(--ui-bg-rgb), 0.75) !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.app-container.glass-effect .terminal-container {
  background: rgba(var(--terminal-bg-rgb), 0.85) !important;
}

/* 降级支持（不支持 backdrop-filter 的浏览器）*/
@supports not (backdrop-filter: blur(20px)) {
  .app-container.glass-effect {
    background: rgba(var(--ui-bg-rgb), 0.92) !important;
  }
}
```

**颜色变量扩展：**

每个主题需要额外定义 RGB 变量用于 `rgba()`：

```typescript
// 示例：Dracula 主题
ui: {
  bg: '#282a36',
  // ... 其他颜色
},
// 新增 RGB 变量
uiRgb: {
  bg: '40, 42, 54',  // 从 #282a36 转换
},
terminalRgb: {
  bg: '40, 42, 54',
}
```

**App.vue 模板应用：**

```vue
<template>
  <div
    class="app-container"
    :class="{ 'glass-effect': themeStore.glassEffectEnabled }"
    :style="cssVars"
  >
    <!-- ... -->
  </div>
</template>

<script setup>
const cssVars = computed(() => {
  const theme = themeStore.getCurrentTheme();
  return {
    '--ui-bg': theme.ui.bg,
    '--ui-bg-rgb': theme.uiRgb.bg,
    '--terminal-bg-rgb': theme.terminalRgb.bg,
    // ... 其他变量
  };
});
</script>
```

### Tauri 窗口配置

**src-tauri/tauri.conf.json 修改：**

```json
{
  "tauri": {
    "windows": [
      {
        "title": "LumiTerm",
        "width": 1000,
        "height": 700,
        "transparent": true,
        "decorations": true
      }
    ]
  }
}
```

**注意事项：**
- Windows 11 原生支持 Acrylic/Mica 效果
- Windows 10 需要 `backdrop-filter` CSS 实现
- 性能影响：模糊效果可能在低端设备上影响性能（用户可关闭）
- 终端文本可读性：背景透明度设为 75-85% 保证文字清晰

---

## UI 设计

### SettingsModal 主题标签页扩展

**布局：**

```
┌─────────────────────────────────────────────┐
│ 外观主题                                     │
│                                             │
│ ┌─────────────────────────────────────┐    │
│ │ [ ] 启用毛玻璃效果                   │    │  ← 新增开关
│ │     需要 Windows 11 或更高版本        │    │
│ └─────────────────────────────────────┘    │
│                                             │
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│ │主题│ │主题│ │主题│ │主题│ │主题│  ...    │  ← 主题网格
│ └────┘ └────┘ └────┘ └────┘ └────┘        │
└─────────────────────────────────────────────┘
```

**交互行为：**
- 切换开关立即生效（无需重启）
- 开关状态持久化到 localStorage
- 主题切换时保持毛玻璃效果状态
- 提示文字说明系统要求

---

## 构建脚本设计

### scripts/import-warp-themes.js

**功能：**
1. 从 Warp GitHub 下载指定的 9 个主题 YAML 文件
2. 解析 YAML 内容
3. 应用转换规则生成 `AppTheme` 对象
4. 自动计算 RGB 变量用于毛玻璃效果
5. 将结果写入 `src/themes/warp-imported.ts`

**执行方式：**
```bash
node scripts/import-warp-themes.js
```

**可选：添加到 package.json：**
```json
{
  "scripts": {
    "import-themes": "node scripts/import-warp-themes.js"
  }
}
```

**主题 URL 列表：**
```javascript
const THEMES_TO_IMPORT = [
  'gruvbox_dark',
  'gruvbox_light',
  'solarized_dark',
  'solarized_light',
  'one_dark',
  'monokai',
  'ayu_dark',
  'ayu_light',
  'github_dark',
];

const BASE_URL = 'https://raw.githubusercontent.com/warpdotdev/themes/main/standard/';
```

---

## 边界情况处理

### 1. 浏览器不支持 backdrop-filter
- 降级为纯色半透明背景（透明度 92%，无模糊效果）
- 使用 `@supports` 检测并应用降级样式
- 不显示错误提示

### 2. 主题 YAML 解析失败
- 脚本跳过该主题，输出警告到控制台
- 不中断整个导入流程
- 继续处理其他主题

### 3. 颜色转换异常
- 使用默认值填充（如 `#808080`）
- 记录日志便于调试
- 确保生成的主题文件语法正确

### 4. 毛玻璃效果性能问题
- 用户可随时通过开关关闭
- 文档中说明性能影响
- 建议在低端设备上关闭

### 5. RGB 变量计算
- 使用正则表达式解析十六进制颜色
- 转换为 RGB 格式：`#282a36` → `40, 42, 54`
- 处理 3 位和 6 位十六进制格式

---

## 测试验证点

- [ ] 15 个主题都能正确加载和切换
- [ ] 毛玻璃效果开关正常工作
- [ ] 终端文本在毛玻璃模式下清晰可读
- [ ] 主题和毛玻璃状态正确持久化到 localStorage
- [ ] 不支持 backdrop-filter 的环境降级正常
- [ ] 构建脚本能成功下载和转换所有主题
- [ ] 颜色转换算法生成的 UI 颜色协调一致
- [ ] 深色和浅色主题的毛玻璃效果都合适
- [ ] 窗口透明效果在 Windows 11 上正常工作

---

## 依赖变更

**package.json 新增：**
```json
{
  "devDependencies": {
    "js-yaml": "^4.1.0"
  }
}
```

---

## 不在本次范围内

- 主题预览图生成（可手动截图）
- 用户自定义主题编辑器
- 运行时动态加载更多主题
- 背景图片支持（Warp 支持，但 LumiTerm 暂不支持）
- 主题导出/分享功能
- 主题市场/社区
