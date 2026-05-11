# Warp Themes 导入与毛玻璃效果 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 Warp Themes 仓库导入 9 个新主题（总计 15 个），并为所有主题添加可选的毛玻璃效果开关。

**Architecture:** 构建时通过 Node.js 脚本从 Warp GitHub 下载 YAML 主题，转换为 LumiTerm `AppTheme` 格式，生成 TypeScript 模块。重构 `themeStore.ts` 拆分主题定义到独立文件，添加 `glassEffectEnabled` 状态。`App.vue` 根据状态切换 `glass-effect` CSS 类，通过 `backdrop-filter` 实现毛玻璃效果。

**Tech Stack:** TypeScript, Vue 3 (Composition API), Pinia, Node.js (构建脚本), js-yaml, CSS backdrop-filter, Tauri 透明窗口。

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `scripts/import-warp-themes.js` | 从 Warp GitHub 下载并转换主题 YAML |
| Create | `scripts/lib/color-utils.js` | 颜色转换工具（hex ↔ rgb、HSL 亮度调整） |
| Create | `src/themes/builtin.ts` | 当前 6 个内置主题（从 themeStore 抽出） |
| Create | `src/themes/warp-imported.ts` | 脚本生成的 9 个 Warp 主题 |
| Create | `src/themes/index.ts` | 统一导出所有主题 |
| Create | `src/themes/types.ts` | AppTheme 类型定义（含 uiRgb / terminalRgb） |
| Create | `src/themes/colorUtils.ts` | 运行时颜色工具（hex → RGB 字符串） |
| Create | `src/themes/colorUtils.test.ts` | 颜色工具单元测试 |
| Modify | `src/stores/themeStore.ts` | 移除内联主题，引入 themes/index，添加 glassEffectEnabled |
| Modify | `src/App.vue` | 应用 glass-effect 类，注入 RGB CSS 变量 |
| Modify | `src/components/SettingsModal.vue` | 添加毛玻璃效果开关 |
| Modify | `src-tauri/tauri.conf.json` | 启用透明窗口 |
| Modify | `package.json` | 添加 js-yaml 依赖和 import-themes 脚本 |
| Modify | `src/utils/xtermInitializer.ts` | （仅在需要时）适配新主题接口 |

---

## Task 1: 添加 js-yaml 依赖

**Files:**
- Modify: `package.json`

- [ ] **Step 1.1: 安装 js-yaml**

```powershell
cd E:\claudecode\lumi-term
rtk npx pnpm add -D js-yaml @types/js-yaml
```

预期：`package.json` 的 `devDependencies` 中新增 `js-yaml` 和 `@types/js-yaml`。

- [ ] **Step 1.2: 添加 import-themes 脚本**

在 `package.json` 的 `scripts` 部分新增一行（注意末尾逗号）：

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --noEmit && vite build",
    "preview": "vite preview",
    "tauri": "tauri",
    "test": "vitest",
    "test:run": "vitest run",
    "import-themes": "node scripts/import-warp-themes.js"
  }
}
```

- [ ] **Step 1.3: 提交**

```powershell
rtk git add package.json pnpm-lock.yaml
rtk git commit -m "chore: add js-yaml dependency for theme import script"
```

---

## Task 2: 颜色工具（脚本端 + 运行时）

**Files:**
- Create: `scripts/lib/color-utils.js`
- Create: `src/themes/colorUtils.ts`
- Create: `src/themes/colorUtils.test.ts`

颜色工具用于：
1. 把 `#282a36` 之类的十六进制颜色转成 `40, 42, 54` RGB 字符串（用于 `rgba(var(--ui-bg-rgb), 0.75)`）
2. 在 HSL 色彩空间调整亮度（脚本生成 UI 派生色用）

- [ ] **Step 2.1: 编写运行时颜色工具的失败测试**

创建 `src/themes/colorUtils.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { hexToRgbString } from './colorUtils';

describe('hexToRgbString', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgbString('#282a36')).toBe('40, 42, 54');
  });

  it('parses 3-digit hex by expanding to 6', () => {
    expect(hexToRgbString('#abc')).toBe('170, 187, 204');
  });

  it('is case-insensitive', () => {
    expect(hexToRgbString('#FFFFFF')).toBe('255, 255, 255');
    expect(hexToRgbString('#ffffff')).toBe('255, 255, 255');
  });

  it('falls back to mid grey for invalid input', () => {
    expect(hexToRgbString('not-a-color')).toBe('128, 128, 128');
    expect(hexToRgbString('')).toBe('128, 128, 128');
  });
});
```

- [ ] **Step 2.2: 运行测试确认失败**

```powershell
rtk npx vitest run src/themes/colorUtils.test.ts
```

预期：失败（`colorUtils.ts` 不存在）。

- [ ] **Step 2.3: 实现 src/themes/colorUtils.ts**

```typescript
export function hexToRgbString(hex: string): string {
  const fallback = '128, 128, 128';
  if (typeof hex !== 'string') return fallback;

  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) {
    value = value.split('').map((c) => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return fallback;

  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
```

- [ ] **Step 2.4: 运行测试确认通过**

```powershell
rtk npx vitest run src/themes/colorUtils.test.ts
```

预期：4 个测试全部通过。

- [ ] **Step 2.5: 创建脚本端颜色工具 scripts/lib/color-utils.js**

脚本端不能复用 TS 模块（避免引入构建依赖），所以独立实现。文件路径：`scripts/lib/color-utils.js`：

```javascript
// 解析 hex 到 [r, g, b]
function hexToRgb(hex) {
  if (typeof hex !== 'string') return [128, 128, 128];
  let value = hex.trim().replace(/^#/, '');
  if (value.length === 3) value = value.split('').map((c) => c + c).join('');
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return [128, 128, 128];
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

function rgbToHex(r, g, b) {
  const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));
  const h = (n) => clamp(n).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

function hexToRgbString(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `${r}, ${g}, ${b}`;
}

// RGB → HSL（HSL 都是 0-1）
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [h, s, l];
}

function hslToRgb(h, s, l) {
  let r;
  let g;
  let b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [r * 255, g * 255, b * 255];
}

// 在 HSL 空间调整亮度，delta 单位是 0-1（例如 0.05 = +5%）
function shiftLightness(hex, delta) {
  const [r, g, b] = hexToRgb(hex);
  const [h, s, l] = rgbToHsl(r, g, b);
  const newL = Math.max(0, Math.min(1, l + delta));
  const [nr, ng, nb] = hslToRgb(h, s, newL);
  return rgbToHex(nr, ng, nb);
}

function getLightness(hex) {
  const [r, g, b] = hexToRgb(hex);
  const [, , l] = rgbToHsl(r, g, b);
  return l;
}

module.exports = {
  hexToRgb,
  rgbToHex,
  hexToRgbString,
  shiftLightness,
  getLightness,
};
```

- [ ] **Step 2.6: 提交**

```powershell
rtk git add src/themes/colorUtils.ts src/themes/colorUtils.test.ts scripts/lib/color-utils.js
rtk git commit -m "feat: add hex/RGB/HSL color utilities for theme system"
```

---

## Task 3: 扩展 AppTheme 类型（添加 RGB 变体）

**Files:**
- Create: `src/themes/types.ts`

为了支持 `rgba(var(--ui-bg-rgb), 0.75)` 形式的毛玻璃叠加，每个主题需要带有 RGB 字符串变体。我们扩展 `AppTheme` 类型并集中放到 `src/themes/types.ts`，方便后续被 builtin / warp-imported 共享。

- [ ] **Step 3.1: 创建 src/themes/types.ts**

```typescript
import type { TerminalTheme } from '../utils/xtermInitializer';

export interface AppThemeUi {
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
}

export interface AppTheme {
  name: string;
  label: string;
  /** "darker" = 深色主题, "lighter" = 浅色主题；用于派生色 + 决定毛玻璃透明度 */
  variant: 'darker' | 'lighter';
  ui: AppThemeUi;
  terminal: TerminalTheme;
  /** 与 ui.bg / terminal.background 对应的 "r, g, b" 字符串，用于 rgba() */
  rgb: {
    uiBg: string;
    terminalBg: string;
  };
}

export type { TerminalTheme };
```

- [ ] **Step 3.2: 提交**

```powershell
rtk git add src/themes/types.ts
rtk git commit -m "feat: define AppTheme type with variant and RGB fields"
```

---

## Task 4: 抽出内置主题到 src/themes/builtin.ts

**Files:**
- Create: `src/themes/builtin.ts`

把当前 `themeStore.ts` 里硬编码的 6 个主题搬到独立文件，并按 Task 3 的类型补上 `variant` 和 `rgb` 字段。

- [ ] **Step 4.1: 创建 src/themes/builtin.ts**

按照下面的内容创建（颜色值与现有 `themeStore.ts` 完全一致；`rgb` 用 `hexToRgbString` 推导一次，写成字面量避免运行时计算）：

```typescript
import type { AppTheme } from './types';

export const builtinThemes: AppTheme[] = [
  {
    name: 'warp-dark',
    label: 'Warp Dark',
    variant: 'darker',
    ui: {
      bg: '#111113',
      bgLight: '#1c1c1e',
      bgLighter: '#6a6a74',
      menuBg: '#2a2a2e',
      menuBorder: '#a0a0a8',
      menuHover: '#3e3e44',
      fg: '#e8e8e8',
      fgMuted: '#c0c0c8',
      accent: '#5b9cf6',
      border: '#808088',
      hover: '#787884',
    },
    terminal: {
      background: '#1c1c1e',
      foreground: '#e8e8e8',
      cursor: '#5b9cf6',
      cursorAccent: '#1c1c1e',
      selectionBackground: '#3a3a3e',
      black: '#1c1c1e', brightBlack: '#6e6e73',
      red: '#ff6b6b', brightRed: '#ff8585',
      green: '#a6e3a1', brightGreen: '#b8f0b3',
      yellow: '#ffd93d', brightYellow: '#ffe066',
      blue: '#5b9cf6', brightBlue: '#7db3ff',
      magenta: '#c792ea', brightMagenta: '#d4a8f5',
      cyan: '#89ddff', brightCyan: '#a3e8ff',
      white: '#c8c8c8', brightWhite: '#ffffff',
    },
    rgb: { uiBg: '17, 17, 19', terminalBg: '28, 28, 30' },
  },
  {
    name: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    variant: 'darker',
    ui: {
      bg: '#181825', bgLight: '#1e1e2e', bgLighter: '#45456a',
      menuBg: '#2a2a3e', menuBorder: '#7c7fa8', menuHover: '#3d3d5c',
      fg: '#cdd6f4', fgMuted: '#9194a7', accent: '#89b4fa',
      border: '#62628a', hover: '#55578a',
    },
    terminal: {
      background: '#1e1e2e', foreground: '#cdd6f4', cursor: '#f5e0dc',
      cursorAccent: '#1e1e2e',
      selectionBackground: '#45475a',
      black: '#45475a', red: '#f38ba8', green: '#a6e3a1', yellow: '#f9e2af',
      blue: '#89b4fa', magenta: '#f5c2e7', cyan: '#94e2d5', white: '#bac2de',
      brightBlack: '#585b70', brightRed: '#f38ba8', brightGreen: '#a6e3a1',
      brightYellow: '#f9e2af', brightBlue: '#89b4fa', brightMagenta: '#f5c2e7',
      brightCyan: '#94e2d5', brightWhite: '#a6adc8',
    },
    rgb: { uiBg: '24, 24, 37', terminalBg: '30, 30, 46' },
  },
  {
    name: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    variant: 'lighter',
    ui: {
      bg: '#dce0e8', bgLight: '#eff1f5', bgLighter: '#e6e9ef',
      menuBg: '#ffffff', menuBorder: '#8c90a0', menuHover: '#e0e4f0',
      fg: '#4c4f69', fgMuted: '#9ca0b0', accent: '#1e66f5',
      border: '#bcc0cc', hover: '#acb0be',
    },
    terminal: {
      background: '#eff1f5', foreground: '#4c4f69', cursor: '#dc8a78',
      cursorAccent: '#eff1f5',
      selectionBackground: '#acb0be',
      black: '#5c5f77', red: '#d20f39', green: '#40a02b', yellow: '#df8e1d',
      blue: '#1e66f5', magenta: '#ea76cb', cyan: '#179299', white: '#6c6f85',
      brightBlack: '#6c6f85', brightRed: '#d20f39', brightGreen: '#40a02b',
      brightYellow: '#df8e1d', brightBlue: '#1e66f5', brightMagenta: '#ea76cb',
      brightCyan: '#179299', brightWhite: '#9ca0b0',
    },
    rgb: { uiBg: '220, 224, 232', terminalBg: '239, 241, 245' },
  },
  {
    name: 'dracula',
    label: 'Dracula',
    variant: 'darker',
    ui: {
      bg: '#1e1f29', bgLight: '#282a36', bgLighter: '#343746',
      menuBg: '#363848', menuBorder: '#8890b8', menuHover: '#44475a',
      fg: '#f8f8f2', fgMuted: '#8090c4', accent: '#bd93f9',
      border: '#44475a', hover: '#505461',
    },
    terminal: {
      background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2',
      cursorAccent: '#282a36',
      selectionBackground: '#44475a',
      black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
      blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
      brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94',
      brightYellow: '#ffffa5', brightBlue: '#d6acff', brightMagenta: '#ff92df',
      brightCyan: '#a4ffff', brightWhite: '#ffffff',
    },
    rgb: { uiBg: '30, 31, 41', terminalBg: '40, 42, 54' },
  },
  {
    name: 'tokyo-night',
    label: 'Tokyo Night',
    variant: 'darker',
    ui: {
      bg: '#1a1b26', bgLight: '#1f2035', bgLighter: '#3a4070',
      menuBg: '#2a2d47', menuBorder: '#8090c8', menuHover: '#3a4060',
      fg: '#c0caf5', fgMuted: '#8891bb', accent: '#7aa2f7',
      border: '#525888', hover: '#4b527a',
    },
    terminal: {
      background: '#1a1b26', foreground: '#c0caf5', cursor: '#c0caf5',
      cursorAccent: '#1a1b26',
      selectionBackground: '#33467c',
      black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
      blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
      brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
      brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
      brightCyan: '#7dcfff', brightWhite: '#c0caf5',
    },
    rgb: { uiBg: '26, 27, 38', terminalBg: '26, 27, 38' },
  },
  {
    name: 'nord',
    label: 'Nord',
    variant: 'darker',
    ui: {
      bg: '#2e3440', bgLight: '#353c4a', bgLighter: '#5a6680',
      menuBg: '#434c5e', menuBorder: '#8898b8', menuHover: '#4c566a',
      fg: '#eceff4', fgMuted: '#aab4c4', accent: '#88c0d0',
      border: '#6e7c90', hover: '#606e80',
    },
    terminal: {
      background: '#2e3440', foreground: '#d8dee9', cursor: '#eceff4',
      cursorAccent: '#2e3440',
      selectionBackground: '#434c5e',
      black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
      blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
      brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
      brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
      brightCyan: '#8fbcbb', brightWhite: '#eceff4',
    },
    rgb: { uiBg: '46, 52, 64', terminalBg: '46, 52, 64' },
  },
];
```

> 注意：当前 `themeStore.ts` 的 `catppuccin-mocha` / `tokyo-night` / `nord` 等条目缺少 `cursorAccent`，但 `TerminalTheme` 接口中该字段是可选的。这里统一补齐以保持新旧主题字段一致。

- [ ] **Step 4.2: 提交**

```powershell
rtk git add src/themes/builtin.ts
rtk git commit -m "feat: extract builtin themes to src/themes/builtin.ts"
```

---

## Task 5: 创建 themes/index 占位 + 重构 themeStore

**Files:**
- Create: `src/themes/index.ts`
- Modify: `src/stores/themeStore.ts`

在 Task 6 生成 `warp-imported.ts` 之前，先让现有代码跑通：`themes/index.ts` 只导出 builtin，`themeStore` 从这里取主题。这样 Task 6 只需要再追加一行 import 即可。

- [ ] **Step 5.1: 创建 src/themes/index.ts**

```typescript
import type { AppTheme } from './types';
import { builtinThemes } from './builtin';

export type { AppTheme, AppThemeUi, TerminalTheme } from './types';

export const allThemes: AppTheme[] = [...builtinThemes];
```

- [ ] **Step 5.2: 重写 src/stores/themeStore.ts**

完整替换为：

```typescript
import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { allThemes } from '../themes';
import type { AppTheme } from '../themes';

export type { AppTheme } from '../themes';

const THEME_KEY = 'lumiterm_theme';
const GLASS_KEY = 'lumiterm_glass_effect';

export const useThemeStore = defineStore('theme', () => {
  const themes: AppTheme[] = allThemes;
  const currentName = ref(themes[0].name);
  const glassEffectEnabled = ref(false);

  function getCurrentTheme(): AppTheme {
    return themes.find((t) => t.name === currentName.value) ?? themes[0];
  }

  function setTheme(name: string) {
    if (themes.some((t) => t.name === name)) {
      currentName.value = name;
    }
  }

  function getAllThemes(): AppTheme[] {
    return themes;
  }

  function toggleGlassEffect() {
    glassEffectEnabled.value = !glassEffectEnabled.value;
  }

  // Persist theme name
  watch(currentName, (name) => {
    try { localStorage.setItem(THEME_KEY, name); } catch { /* ignore */ }
  });

  // Persist glass effect flag
  watch(glassEffectEnabled, (enabled) => {
    try { localStorage.setItem(GLASS_KEY, String(enabled)); } catch { /* ignore */ }
  });

  // Load persisted theme
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && themes.some((t) => t.name === saved)) {
      currentName.value = saved;
    }
  } catch { /* ignore */ }

  // Load persisted glass flag
  try {
    const saved = localStorage.getItem(GLASS_KEY);
    if (saved !== null) glassEffectEnabled.value = saved === 'true';
  } catch { /* ignore */ }

  return {
    currentName,
    glassEffectEnabled,
    getCurrentTheme,
    setTheme,
    getAllThemes,
    toggleGlassEffect,
  };
});
```

- [ ] **Step 5.3: 类型检查 + 运行已有测试**

```powershell
rtk npx vue-tsc --noEmit
rtk npx vitest run
```

预期：类型检查通过；现有测试全部通过（主题数量等行为未变）。如果有任何调用方因 `getCurrentTheme()` 返回类型变化报错（理论上不会，因为字段是兼容超集），就地修复。

- [ ] **Step 5.4: 提交**

```powershell
rtk git add src/themes/index.ts src/stores/themeStore.ts
rtk git commit -m "refactor: route themeStore through src/themes index and add glassEffectEnabled"
```

---

## Task 6: 编写 Warp 主题导入脚本

**Files:**
- Create: `scripts/import-warp-themes.js`

脚本拉取 9 个 YAML，转换为 `AppTheme[]`，写到 `src/themes/warp-imported.ts`。

- [ ] **Step 6.1: 创建 scripts/import-warp-themes.js**

```javascript
#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const https = require('https');
const yaml = require('js-yaml');
const {
  hexToRgbString,
  shiftLightness,
  getLightness,
} = require('./lib/color-utils');

const BASE_URL = 'https://raw.githubusercontent.com/warpdotdev/themes/main/standard/';

// [warp 文件名, name, label]
const THEMES_TO_IMPORT = [
  ['gruvbox_dark.yaml', 'gruvbox-dark', 'Gruvbox Dark'],
  ['gruvbox_light.yaml', 'gruvbox-light', 'Gruvbox Light'],
  ['solarized_dark.yaml', 'solarized-dark', 'Solarized Dark'],
  ['solarized_light.yaml', 'solarized-light', 'Solarized Light'],
  ['one_dark.yaml', 'one-dark', 'One Dark'],
  ['monokai.yaml', 'monokai', 'Monokai'],
  ['ayu_dark.yaml', 'ayu-dark', 'Ayu Dark'],
  ['ayu_light.yaml', 'ayu-light', 'Ayu Light'],
  ['github_dark.yaml', 'github-dark', 'GitHub Dark'],
];

const OUTPUT = path.join(__dirname, '..', 'src', 'themes', 'warp-imported.ts');

function fetchText(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          fetchText(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          return;
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => resolve(data));
      })
      .on('error', reject);
  });
}

// Warp 颜色字段可能没带 #、可能是大写 → 标准化为 #rrggbb 小写
function normHex(value, fallback = '#808080') {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  const hex = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.toLowerCase() : fallback;
}

function deriveUi(bg, fg, accent, variant) {
  // variant 决定 UI 派生色的偏移方向：深色 → 加亮，浅色 → 减亮
  const dir = variant === 'darker' ? +1 : -1;
  return {
    bg,
    bgLight: shiftLightness(bg, dir * 0.05),
    bgLighter: shiftLightness(bg, dir * 0.15),
    menuBg: shiftLightness(bg, dir * 0.08),
    menuBorder: shiftLightness(bg, dir * 0.3),
    menuHover: shiftLightness(bg, dir * 0.1),
    fg,
    fgMuted: shiftLightness(fg, -dir * 0.2),
    accent,
    border: shiftLightness(bg, dir * 0.25),
    hover: shiftLightness(bg, dir * 0.12),
  };
}

function convertTheme(warp, name, label) {
  const detailsRaw = typeof warp.details === 'string' ? warp.details.toLowerCase() : null;
  const bg = normHex(warp.background);
  const fg = normHex(warp.foreground);
  const accent = normHex(warp.accent, fg);

  const variant =
    detailsRaw === 'lighter' || detailsRaw === 'darker'
      ? detailsRaw
      : (getLightness(bg) > 0.5 ? 'lighter' : 'darker');

  const colors = warp.terminal_colors || {};
  const normal = colors.normal || {};
  const bright = colors.bright || {};
  const pick = (obj, key, fb) => normHex(obj[key], fb);

  return {
    name,
    label,
    variant,
    ui: deriveUi(bg, fg, accent, variant),
    terminal: {
      background: bg,
      foreground: fg,
      cursor: accent,
      cursorAccent: bg,
      selectionBackground: shiftLightness(bg, (variant === 'darker' ? +1 : -1) * 0.15),
      black: pick(normal, 'black', '#000000'),
      red: pick(normal, 'red', '#ff0000'),
      green: pick(normal, 'green', '#00ff00'),
      yellow: pick(normal, 'yellow', '#ffff00'),
      blue: pick(normal, 'blue', '#0000ff'),
      magenta: pick(normal, 'magenta', '#ff00ff'),
      cyan: pick(normal, 'cyan', '#00ffff'),
      white: pick(normal, 'white', '#ffffff'),
      brightBlack: pick(bright, 'black', '#808080'),
      brightRed: pick(bright, 'red', '#ff8080'),
      brightGreen: pick(bright, 'green', '#80ff80'),
      brightYellow: pick(bright, 'yellow', '#ffff80'),
      brightBlue: pick(bright, 'blue', '#8080ff'),
      brightMagenta: pick(bright, 'magenta', '#ff80ff'),
      brightCyan: pick(bright, 'cyan', '#80ffff'),
      brightWhite: pick(bright, 'white', '#ffffff'),
    },
    rgb: {
      uiBg: hexToRgbString(bg),
      terminalBg: hexToRgbString(bg),
    },
  };
}

function renderTs(themes) {
  const json = JSON.stringify(themes, null, 2);
  return `/* eslint-disable */
// AUTO-GENERATED by scripts/import-warp-themes.js
// Source: https://github.com/warpdotdev/themes (standard/)
// Do not edit by hand. Re-run: pnpm run import-themes

import type { AppTheme } from './types';

export const warpImportedThemes: AppTheme[] = ${json};
`;
}

async function main() {
  console.log(`Importing ${THEMES_TO_IMPORT.length} themes from Warp …`);
  const results = [];
  for (const [file, name, label] of THEMES_TO_IMPORT) {
    const url = BASE_URL + file;
    try {
      const text = await fetchText(url);
      const parsed = yaml.load(text);
      results.push(convertTheme(parsed, name, label));
      console.log(`  ✓ ${label}`);
    } catch (err) {
      console.warn(`  ✗ ${label}: ${err.message} — skipped`);
    }
  }

  if (results.length === 0) {
    console.error('No themes imported. Aborting.');
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT, renderTs(results), 'utf8');
  console.log(`\nWrote ${results.length} themes to ${path.relative(process.cwd(), OUTPUT)}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 6.2: 运行脚本生成 warp-imported.ts**

```powershell
rtk npx pnpm run import-themes
```

预期输出：依次列出 9 个主题的 `✓`，并写入 `src/themes/warp-imported.ts`。

如果某些主题 404（Warp 仓库重命名了文件），脚本会跳过并打印警告；此时打开浏览器去 https://github.com/warpdotdev/themes/tree/main/standard 查找实际文件名并更新 `THEMES_TO_IMPORT`。

- [ ] **Step 6.3: 检查生成文件**

```powershell
Get-Content src/themes/warp-imported.ts -TotalCount 30
```

预期：能看到 `AUTO-GENERATED` 注释和合法的 TypeScript 数组开头。

- [ ] **Step 6.4: 提交**

```powershell
rtk git add scripts/import-warp-themes.js src/themes/warp-imported.ts
rtk git commit -m "feat: add Warp themes import script and generated themes"
```

---

## Task 7: 在主题索引中合并 Warp 主题

**Files:**
- Modify: `src/themes/index.ts`

- [ ] **Step 7.1: 更新 src/themes/index.ts**

完整替换为：

```typescript
import type { AppTheme } from './types';
import { builtinThemes } from './builtin';
import { warpImportedThemes } from './warp-imported';

export type { AppTheme, AppThemeUi, TerminalTheme } from './types';

export const allThemes: AppTheme[] = [
  ...builtinThemes,
  ...warpImportedThemes,
];
```

- [ ] **Step 7.2: 类型检查**

```powershell
rtk npx vue-tsc --noEmit
```

预期：通过。

- [ ] **Step 7.3: 启动 dev server 手动验证**

```powershell
rtk npx pnpm tauri dev
```

操作步骤：
1. 打开设置 → 主题，应能看到 15 个主题卡片
2. 依次切换 Gruvbox Dark / Solarized Light / One Dark / GitHub Dark
3. 终端背景、UI 强调色应随主题变化
4. 关闭再开应用，最后选的主题应被保留

- [ ] **Step 7.4: 提交**

```powershell
rtk git add src/themes/index.ts
rtk git commit -m "feat: include Warp-imported themes in theme list"
```

---

## Task 8: 启用 Tauri 透明窗口

**Files:**
- Modify: `src-tauri/tauri.conf.json`

毛玻璃需要窗口本身允许透明（否则 `backdrop-filter` 拿不到下层图像）。

- [ ] **Step 8.1: 查看现有配置**

```powershell
Get-Content src-tauri/tauri.conf.json
```

记下 `app.windows[0]` 的当前字段（保留 title / width / height 等）。

- [ ] **Step 8.2: 在主窗口配置中添加 transparent: true**

打开 `src-tauri/tauri.conf.json`，找到 `app.windows` 数组里 `label` 为 `"main"` 的窗口对象，加入：

```json
"transparent": true
```

（如果已有该字段为 `false`，改成 `true`；不要新增多余字段。）

- [ ] **Step 8.3: 重新构建并启动**

```powershell
rtk npx pnpm tauri dev
```

预期：应用正常启动；当前不应有视觉变化（因为还没启用毛玻璃开关）。如果启动失败，回退该字段。

- [ ] **Step 8.4: 提交**

```powershell
rtk git add src-tauri/tauri.conf.json
rtk git commit -m "feat: enable transparent main window for glass effect"
```

---

## Task 9: 在 App.vue 注入 RGB 变量并支持 glass-effect 类

**Files:**
- Modify: `src/App.vue`

- [ ] **Step 9.1: 扩展 uiVars 计算属性，加入 RGB 变量**

在 `src/App.vue` 的 `uiVars` computed 中追加 `--ui-bg-rgb` 与 `--terminal-bg-rgb`：

```typescript
const uiVars = computed(() => {
  const theme = themeStore.getCurrentTheme();
  const ui = theme.ui;
  return {
    '--ui-bg': ui.bg,
    '--ui-bg-light': ui.bgLight,
    '--ui-bg-lighter': ui.bgLighter,
    '--ui-menu-bg': ui.menuBg,
    '--ui-menu-border': ui.menuBorder,
    '--ui-menu-hover': ui.menuHover,
    '--ui-fg': ui.fg,
    '--ui-fg-muted': ui.fgMuted,
    '--ui-accent': ui.accent,
    '--ui-border': ui.border,
    '--ui-hover': ui.hover,
    '--ui-bg-rgb': theme.rgb.uiBg,
    '--terminal-bg-rgb': theme.rgb.terminalBg,
  };
});
```

- [ ] **Step 9.2: 给最外层容器添加 glass-effect 类**

在 `<template>` 的最外层根元素（包裹整个应用的 div）上添加 class 绑定。打开 `src/App.vue` 找到对应根 div（一般是 `class="app-container"` 或类似），改为：

```vue
<div
  class="app-container"
  :class="{ 'glass-effect': themeStore.glassEffectEnabled }"
  @mousedown="startDrag"
>
  <!-- ... 现有内容不变 ... -->
</div>
```

> 如果根元素实际不是 `app-container`，沿用当前的 class 名，仅追加 `:class="{ 'glass-effect': themeStore.glassEffectEnabled }"`。

- [ ] **Step 9.3: 添加毛玻璃 CSS**

在 `src/App.vue` 的 `<style>` 末尾追加（如果是 `scoped` 样式，这里需要写在全局样式里。当前 App.vue 已使用根选择器控制全局，沿用原方式）：

```css
.glass-effect {
  background: rgba(var(--ui-bg-rgb), 0.75) !important;
  backdrop-filter: blur(20px) saturate(180%);
  -webkit-backdrop-filter: blur(20px) saturate(180%);
}

.glass-effect :deep(.terminal-container),
.glass-effect .terminal-container {
  background: rgba(var(--terminal-bg-rgb), 0.85) !important;
}

@supports not (backdrop-filter: blur(20px)) {
  .glass-effect {
    background: rgba(var(--ui-bg-rgb), 0.92) !important;
  }
}
```

> 如果 App.vue 当前样式块是 `<style scoped>`，要么改用 `:deep()` 选择子组件，要么把这段放进 `<style>`（无 scoped）。落实时按文件实际情况选其一，并保留原有样式块。

- [ ] **Step 9.4: 类型检查**

```powershell
rtk npx vue-tsc --noEmit
```

- [ ] **Step 9.5: 提交**

```powershell
rtk git add src/App.vue
rtk git commit -m "feat: inject RGB CSS vars and apply glass-effect class in App.vue"
```

---

## Task 10: 设置面板添加毛玻璃开关

**Files:**
- Modify: `src/components/SettingsModal.vue`

- [ ] **Step 10.1: 在 Theme 标签页添加开关**

打开 `src/components/SettingsModal.vue`，定位到主题 tab 的 `<div v-if="activeTab === 'theme'" class="tab-panel">`，在 `panel-title` 后、`.theme-grid` 前，插入开关区块：

```vue
<div v-if="activeTab === 'theme'" class="tab-panel">
  <h2 class="panel-title">外观主题</h2>

  <label class="glass-toggle">
    <input
      type="checkbox"
      :checked="themeStore.glassEffectEnabled"
      @change="themeStore.toggleGlassEffect()"
    />
    <span class="glass-toggle-label">
      <span class="glass-toggle-title">启用毛玻璃效果</span>
      <span class="glass-toggle-hint">需要 Windows 11 或更高版本；可能影响低端设备性能</span>
    </span>
  </label>

  <div class="theme-grid">
    <!-- 现有主题卡片不变 -->
  </div>
</div>
```

- [ ] **Step 10.2: 添加开关样式**

在 SettingsModal.vue 的 `<style scoped>` 末尾追加：

```css
.glass-toggle {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  background: var(--ui-bg);
  cursor: pointer;
}

.glass-toggle:hover {
  border-color: var(--ui-accent);
}

.glass-toggle input {
  margin-top: 2px;
  accent-color: var(--ui-accent);
  cursor: pointer;
}

.glass-toggle-label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.glass-toggle-title {
  font-size: 12px;
  color: var(--ui-fg);
}

.glass-toggle-hint {
  font-size: 10px;
  color: var(--ui-fg-muted);
}
```

- [ ] **Step 10.3: 类型检查**

```powershell
rtk npx vue-tsc --noEmit
```

- [ ] **Step 10.4: 提交**

```powershell
rtk git add src/components/SettingsModal.vue
rtk git commit -m "feat: add glass effect toggle to settings theme panel"
```

---

## Task 11: 手动验证

- [ ] **Step 11.1: 启动 dev**

```powershell
rtk npx pnpm tauri dev
```

- [ ] **Step 11.2: 主题验证清单**

1. 设置 → 主题，能看到 15 个卡片，顺序：Warp Dark / Catppuccin Mocha / Catppuccin Latte / Dracula / Tokyo Night / Nord / Gruvbox Dark / Gruvbox Light / Solarized Dark / Solarized Light / One Dark / Monokai / Ayu Dark / Ayu Light / GitHub Dark。
2. 依次切换每个主题，观察：终端背景、强调色（光标、按钮）、菜单背景在切换后都立即生效。
3. 在浅色主题（Catppuccin Latte / Gruvbox Light / Solarized Light / Ayu Light）下，UI 文本能在浅色背景上读清楚。
4. 关闭再开应用，最后选的主题被保留。

- [ ] **Step 11.3: 毛玻璃验证清单**

1. 勾选"启用毛玻璃效果"。
2. 把窗口移到桌面壁纸/其它应用之上，能看到背景透出来。
3. 终端文字仍清晰可读（深色主题透明度 0.75 + 0.85 终端）。
4. 关闭开关，恢复不透明背景。
5. 关闭再开应用，毛玻璃状态被保留。
6. 同时切换不同主题验证：RGB 变量随主题更新（不会出现"灰色玻璃 + 深蓝主题"这种不一致）。

- [ ] **Step 11.4: 回归测试**

```powershell
rtk npx vitest run
rtk cargo test -p lumi-term-lib
```

预期：全部通过。

- [ ] **Step 11.5: 如有修复，最终提交**

```powershell
rtk git add -A
rtk git commit -m "fix: address issues found during manual verification"
```

---

## 完成标准

- 设置面板能看到 15 个主题，全部能切换且渲染正常
- 毛玻璃开关切换实时生效，且持久化
- 浅色 / 深色主题在毛玻璃下文字都清晰
- `vue-tsc --noEmit` 通过
- `vitest run` 全部通过
- Rust 测试全部通过
