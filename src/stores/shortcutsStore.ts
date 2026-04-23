import { defineStore } from 'pinia';
import { ref } from 'vue';

export type ShortcutAction =
  | 'copy' | 'paste' | 'cut'
  | 'new-tab' | 'close-tab' | 'next-tab' | 'prev-tab'
  | 'open-settings';

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  'copy': '复制',
  'paste': '粘贴',
  'cut': '剪切',
  'new-tab': '新建标签页',
  'close-tab': '关闭标签页',
  'next-tab': '切换到下一个',
  'prev-tab': '切换到上一个',
  'open-settings': '打开设置',
};

export const SHORTCUT_GROUPS: { label: string; actions: ShortcutAction[] }[] = [
  { label: '编辑', actions: ['copy', 'paste', 'cut'] },
  { label: '标签页', actions: ['new-tab', 'close-tab', 'next-tab', 'prev-tab'] },
  { label: '设置', actions: ['open-settings'] },
];

const DEFAULT_BINDINGS: Record<ShortcutAction, string> = {
  'copy': 'Ctrl+C',
  'paste': 'Ctrl+V',
  'cut': 'Ctrl+X',
  'new-tab': 'Ctrl+T',
  'close-tab': 'Ctrl+W',
  'next-tab': 'Ctrl+Tab',
  'prev-tab': 'Ctrl+Shift+Tab',
  'open-settings': 'Ctrl+,',
};

const STORAGE_KEY = 'lumiterm_shortcuts';

export function keyEventToString(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push('Ctrl');
  if (e.shiftKey) parts.push('Shift');
  if (e.altKey) parts.push('Alt');
  const key = e.key === 'Tab' ? 'Tab'
    : e.key.length === 1 ? e.key.toUpperCase()
    : e.key;
  parts.push(key);
  return parts.join('+');
}

function loadBindings(): Record<ShortcutAction, string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_BINDINGS };
    return { ...DEFAULT_BINDINGS, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

export const useShortcutsStore = defineStore('shortcuts', () => {
  const bindings = ref<Record<ShortcutAction, string>>(loadBindings());

  function getKey(action: ShortcutAction): string {
    return bindings.value[action];
  }

  function hasConflict(key: string): ShortcutAction | null {
    for (const [action, binding] of Object.entries(bindings.value)) {
      if (binding === key) return action as ShortcutAction;
    }
    return null;
  }

  function setKey(action: ShortcutAction, key: string): boolean {
    const conflict = hasConflict(key);
    if (conflict && conflict !== action) return false;
    bindings.value[action] = key;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(bindings.value)); } catch { /* */ }
    return true;
  }

  function resetAll() {
    bindings.value = { ...DEFAULT_BINDINGS };
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* */ }
  }

  function matchesEvent(action: ShortcutAction, e: KeyboardEvent): boolean {
    return bindings.value[action] === keyEventToString(e);
  }

  return { bindings, getKey, hasConflict, setKey, resetAll, matchesEvent };
});
