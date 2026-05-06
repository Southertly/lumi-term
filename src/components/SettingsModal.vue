<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useThemeStore } from '../stores/themeStore';
import { useFontStore, FONT_OPTIONS } from '../stores/fontStore';
import {
  useShortcutsStore, keyEventToString,
  SHORTCUT_LABELS, SHORTCUT_GROUPS,
  type ShortcutAction,
} from '../stores/shortcutsStore';
import { confirm } from '../utils/confirm';

defineProps<{ visible: boolean }>();
const emit = defineEmits<{ close: [] }>();

const themeStore = useThemeStore();
const fontStore = useFontStore();
const shortcutsStore = useShortcutsStore();

type Tab = 'theme' | 'font' | 'shortcuts';
const activeTab = ref<Tab>('theme');

// ── Shortcut rebinding ──
const rebindingAction = ref<ShortcutAction | null>(null);
const rebindError = ref('');

function startRebind(action: ShortcutAction) {
  rebindingAction.value = action;
  rebindError.value = '';
}

function cancelRebind() {
  rebindingAction.value = null;
  rebindError.value = '';
}

function handleRebindKey(e: KeyboardEvent) {
  if (!rebindingAction.value) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') { cancelRebind(); return; }
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

  const keyStr = keyEventToString(e);
  const conflict = shortcutsStore.hasConflict(keyStr);
  if (conflict && conflict !== rebindingAction.value) {
    rebindError.value = `"${keyStr}" 已被「${SHORTCUT_LABELS[conflict]}」使用`;
    return;
  }

  shortcutsStore.setKey(rebindingAction.value, keyStr);
  rebindingAction.value = null;
  rebindError.value = '';
}

async function confirmReset() {
  if (await confirm('重置所有快捷键为默认值？')) {
    shortcutsStore.resetAll();
  }
}

function handleBackdropClick(e: MouseEvent) {
  if (e.target === e.currentTarget) emit('close');
}

function handleKeydown(e: KeyboardEvent) {
  if (rebindingAction.value) {
    handleRebindKey(e);
    return;
  }
  if (e.key === 'Escape') emit('close');
}

onMounted(() => window.addEventListener('keydown', handleKeydown, true));
onUnmounted(() => window.removeEventListener('keydown', handleKeydown, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="visible" class="settings-backdrop" @click="handleBackdropClick">
      <div class="settings-modal" @click.stop>
        <!-- Left nav -->
        <nav class="settings-nav">
          <div class="nav-label">SETTINGS</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'theme' }"
            @click="activeTab = 'theme'"
          >🎨 主题</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'font' }"
            @click="activeTab = 'font'"
          >🔤 字体</div>
          <div
            class="nav-item"
            :class="{ active: activeTab === 'shortcuts' }"
            @click="activeTab = 'shortcuts'"
          >⌨️ 快捷键</div>
        </nav>

        <!-- Right content -->
        <div class="settings-content">

          <!-- Theme tab -->
          <div v-if="activeTab === 'theme'" class="tab-panel">
            <h2 class="panel-title">外观主题</h2>
            <div class="theme-grid">
              <div
                v-for="t in themeStore.getAllThemes()"
                :key="t.name"
                class="theme-card"
                :class="{ active: t.name === themeStore.currentName }"
                @click="themeStore.setTheme(t.name)"
              >
                <div
                  class="theme-preview"
                  :style="{
                    background: `linear-gradient(135deg, ${t.ui.bg} 50%, ${t.ui.bgLight} 50%)`
                  }"
                ></div>
                <div class="theme-info">
                  <span class="theme-name">{{ t.label }}</span>
                  <span v-if="t.name === themeStore.currentName" class="theme-check">✓</span>
                </div>
              </div>
            </div>
          </div>

          <!-- Font tab -->
          <div v-if="activeTab === 'font'" class="tab-panel">
            <h2 class="panel-title">字体设置</h2>
            <div class="font-controls">
              <div class="control-group">
                <label class="control-label">字体</label>
                <select v-model="fontStore.fontFamily" class="control-select">
                  <option v-for="f in FONT_OPTIONS" :key="f" :value="f">{{ f }}</option>
                </select>
              </div>
              <div class="control-group">
                <label class="control-label">
                  字号 <span class="control-value">{{ fontStore.fontSize }}px</span>
                </label>
                <input
                  v-model.number="fontStore.fontSize"
                  type="range" min="8" max="24" step="1"
                  class="control-slider"
                />
                <div class="range-labels"><span>8</span><span>24</span></div>
              </div>
              <div class="control-group">
                <label class="control-label">
                  行高 <span class="control-value">{{ fontStore.lineHeight.toFixed(1) }}</span>
                </label>
                <input
                  v-model.number="fontStore.lineHeight"
                  type="range" min="1.0" max="2.0" step="0.1"
                  class="control-slider"
                />
                <div class="range-labels"><span>1.0</span><span>2.0</span></div>
              </div>
              <div
                class="font-preview"
                :style="{
                  fontFamily: `'${fontStore.fontFamily}', Consolas, monospace`,
                  fontSize: `${fontStore.fontSize}px`,
                  lineHeight: fontStore.lineHeight,
                  background: themeStore.getCurrentTheme().terminal.background,
                  color: themeStore.getCurrentTheme().terminal.foreground,
                }"
              >
                <span :style="{ color: themeStore.getCurrentTheme().terminal.green }">user</span>
                <span> ~/projects </span>
                <span :style="{ color: themeStore.getCurrentTheme().terminal.blue }">❯</span>
                <span> echo 预览 Preview 123</span>
              </div>
            </div>
          </div>

          <!-- Shortcuts tab -->
          <div v-if="activeTab === 'shortcuts'" class="tab-panel">
            <div class="shortcuts-header">
              <h2 class="panel-title">快捷键</h2>
              <button class="reset-btn" @click="confirmReset">↩ 重置默认</button>
            </div>
            <div v-if="rebindError" class="rebind-error">{{ rebindError }}</div>
            <div class="shortcuts-list">
              <template v-for="group in SHORTCUT_GROUPS" :key="group.label">
                <div class="shortcut-group-label">{{ group.label }}</div>
                <div
                  v-for="action in group.actions"
                  :key="action"
                  class="shortcut-row"
                  :class="{
                    rebinding: rebindingAction === action,
                    error: rebindingAction === action && rebindError,
                  }"
                  @click="rebindingAction === action ? cancelRebind() : startRebind(action)"
                >
                  <span class="shortcut-label">{{ SHORTCUT_LABELS[action] }}</span>
                  <span class="shortcut-key">
                    {{ rebindingAction === action ? '请按下新快捷键…' : shortcutsStore.getKey(action) }}
                  </span>
                </div>
              </template>
            </div>
          </div>

        </div>

        <!-- Close button -->
        <button class="modal-close" @click="emit('close')">✕</button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.settings-modal {
  position: relative;
  width: 600px;
  max-width: 90vw;
  height: 420px;
  max-height: 80vh;
  background: var(--ui-menu-bg);
  border: 1px solid var(--ui-menu-border);
  border-radius: 10px;
  display: flex;
  overflow: hidden;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255,255,255,0.07);
}

.settings-nav {
  width: 130px;
  background: rgba(0,0,0,0.15);
  border-right: 1px solid var(--ui-menu-border);
  padding: 16px 0;
  flex-shrink: 0;
}

.nav-label {
  padding: 0 12px 8px;
  color: var(--ui-fg-muted);
  font-size: 9px;
  letter-spacing: 0.8px;
  font-weight: 600;
}

.nav-item {
  padding: 8px 10px;
  margin: 0 6px 2px;
  border-radius: 5px;
  color: var(--ui-fg);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}

.nav-item:hover {
  background: var(--ui-menu-hover);
  color: var(--ui-fg);
}

.nav-item.active {
  background: var(--ui-menu-hover);
  color: var(--ui-accent);
}

.settings-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.modal-close {
  position: absolute;
  top: 10px;
  right: 12px;
  background: transparent;
  border: none;
  color: var(--ui-fg-muted);
  font-size: 14px;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  line-height: 1;
}

.modal-close:hover {
  background: var(--ui-menu-hover);
  color: var(--ui-fg);
}

.tab-panel { display: flex; flex-direction: column; gap: 16px; }
.panel-title { font-size: 14px; font-weight: 600; color: var(--ui-fg); }

/* Theme grid */
.theme-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.theme-card {
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}

.theme-card:hover { border-color: var(--ui-hover); }
.theme-card.active { border-color: var(--ui-accent); border-width: 2px; }

.theme-preview { height: 50px; }
.theme-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  background: var(--ui-bg);
}

.theme-name { font-size: 10px; color: var(--ui-fg); }
.theme-check { color: var(--ui-accent); font-size: 11px; }

/* Font controls */
.font-controls { display: flex; flex-direction: column; gap: 14px; }
.control-group { display: flex; flex-direction: column; gap: 6px; }
.control-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--ui-fg-muted);
}

.control-value { color: var(--ui-accent); }

.control-select {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  color: var(--ui-fg);
  padding: 5px 8px;
  font-size: 12px;
  outline: none;
  cursor: pointer;
}

.control-slider {
  width: 100%;
  accent-color: var(--ui-accent);
  cursor: pointer;
}

.range-labels {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  color: var(--ui-fg-muted);
}

.font-preview {
  border-radius: 6px;
  padding: 10px 12px;
  border: 1px solid var(--ui-border);
  font-family: 'Cascadia Code', monospace;
}

/* Shortcuts */
.shortcuts-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.reset-btn {
  background: transparent;
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  color: var(--ui-fg-muted);
  font-size: 10px;
  padding: 3px 8px;
  cursor: pointer;
}

.reset-btn:hover { border-color: var(--ui-accent); color: var(--ui-fg); }

.rebind-error {
  background: color-mix(in srgb, #ff6b6b 15%, transparent);
  border: 1px solid #ff6b6b;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 11px;
  color: #ff8585;
}

.shortcuts-list { display: flex; flex-direction: column; gap: 1px; }

.shortcut-group-label {
  font-size: 9px;
  color: var(--ui-fg-muted);
  letter-spacing: 0.5px;
  padding: 8px 6px 3px;
  text-transform: uppercase;
}

.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s;
}

.shortcut-row:hover { background: var(--ui-menu-hover); }
.shortcut-row.rebinding { background: color-mix(in srgb, var(--ui-accent) 12%, transparent); }
.shortcut-row.error { background: color-mix(in srgb, #ff6b6b 12%, transparent); }

.shortcut-label { font-size: 12px; color: var(--ui-fg); }

.shortcut-key {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 10px;
  color: var(--ui-accent);
  font-family: 'Cascadia Code', Consolas, monospace;
  white-space: nowrap;
}

.shortcut-row.rebinding .shortcut-key {
  color: var(--ui-fg-muted);
  border-style: dashed;
}
</style>
