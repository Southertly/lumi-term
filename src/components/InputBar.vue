<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useHistoryStore } from '../stores/historyStore';

const props = defineProps<{
  sessionId: string | null;
  isInteractive: boolean;
  cwd: string;
  gitBranch: string;
}>();

const historyStore = useHistoryStore();
const inputValue = ref('');
const inputRef = ref<HTMLInputElement | null>(null);

// ── Inline history list state ──
const showHistory = ref(false);
const selectedHistoryIndex = ref(-1);
let blurTimer: ReturnType<typeof setTimeout> | null = null;

const historyList = computed(() => {
  const q = inputValue.value.trim();
  if (!q) return historyStore.list().slice(0, 10);
  return historyStore.search(q).slice(0, 10);
});

// Reset selection whenever the filtered list changes
watch(historyList, () => {
  selectedHistoryIndex.value = -1;
});

// When interactive mode ends, focus the input bar
watch(() => props.isInteractive, (interactive) => {
  if (!interactive) {
    nextTick(() => inputRef.value?.focus());
  }
});

function displayCwd(cwd: string): string {
  if (!cwd) return '';
  const home = cwd.match(/^[A-Z]:\\Users\\[^\\]+/i)?.[0] ?? '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length).replace(/\\/g, '/');
  }
  return cwd.replace(/\\/g, '/');
}

function handleFocus() {
  if (blurTimer !== null) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  showHistory.value = true;
  selectedHistoryIndex.value = -1;
}

function handleBlur() {
  blurTimer = setTimeout(() => {
    showHistory.value = false;
    blurTimer = null;
  }, 150);
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    if (selectedHistoryIndex.value >= 0 && historyList.value[selectedHistoryIndex.value]) {
      inputValue.value = historyList.value[selectedHistoryIndex.value].command;
      selectedHistoryIndex.value = -1;
      showHistory.value = false;
    }
    sendCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (!showHistory.value) {
      showHistory.value = true;
      selectedHistoryIndex.value = 0;
    } else if (historyList.value.length > 0) {
      selectedHistoryIndex.value = Math.max(0,
        selectedHistoryIndex.value <= 0 ? 0 : selectedHistoryIndex.value - 1
      );
    }
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (showHistory.value && historyList.value.length > 0) {
      const next = selectedHistoryIndex.value + 1;
      selectedHistoryIndex.value = next >= historyList.value.length ? -1 : next;
    }
  } else if (e.key === 'Tab') {
    e.preventDefault();
    if (showHistory.value && selectedHistoryIndex.value >= 0 && historyList.value[selectedHistoryIndex.value]) {
      inputValue.value = historyList.value[selectedHistoryIndex.value].command;
      selectedHistoryIndex.value = -1;
    }
  } else if (e.key === 'Escape') {
    e.preventDefault();
    showHistory.value = false;
    selectedHistoryIndex.value = -1;
  }
}

function selectHistoryItem(command: string) {
  if (blurTimer !== null) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
  inputValue.value = command;
  selectedHistoryIndex.value = -1;
  showHistory.value = false;
  sendCommand();
  inputRef.value?.focus();
}

function sendCommand() {
  const cmd = inputValue.value;
  if (!cmd.trim() || !props.sessionId) return;

  invoke('write_pty_cmd', {
    sessionId: props.sessionId,
    data: Array.from(new TextEncoder().encode(cmd + '\r')),
  }).catch(() => {});

  historyStore.add(cmd);
  inputValue.value = '';
  selectedHistoryIndex.value = -1;
  showHistory.value = false;
}

function fillCommand(command: string) {
  inputValue.value = command;
  selectedHistoryIndex.value = -1;
  nextTick(() => inputRef.value?.focus());
}

onUnmounted(() => {
  if (blurTimer !== null) {
    clearTimeout(blurTimer);
    blurTimer = null;
  }
});

defineExpose({ fillCommand, focus: () => inputRef.value?.focus() });
</script>

<template>
  <div
    class="input-bar"
    :class="{ hidden: isInteractive }"
  >
    <div class="input-context">
      <span v-if="cwd" class="input-cwd">{{ displayCwd(cwd) }}</span>
      <span v-if="gitBranch" class="input-separator">|</span>
      <span v-if="gitBranch" class="input-branch"> {{ gitBranch }}</span>
    </div>
    <div class="input-row">
      <span class="input-prompt">❯</span>
      <input
        ref="inputRef"
        v-model="inputValue"
        class="input-field"
        type="text"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck="false"
        :disabled="!sessionId"
        @keydown="handleKeydown"
        @focus="handleFocus"
        @blur="handleBlur"
      />
    </div>
    <div v-if="showHistory && historyList.length > 0" class="history-list">
      <div class="history-header">历史 {{ historyList.length }} 条 · 输入过滤</div>
      <div
        v-for="(entry, idx) in historyList"
        :key="entry.command"
        class="history-item"
        :class="{ selected: idx === selectedHistoryIndex }"
        @mousedown.prevent="selectHistoryItem(entry.command)"
        @mouseover="selectedHistoryIndex = idx"
      >
        <span class="history-prompt">❯</span>
        <span class="history-command">{{ entry.command }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.input-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: rgba(28, 28, 30, 0.96);
  border-top: 1px solid var(--ui-border);
  padding: 0 14px;
  z-index: 10;
  transition: opacity 0.15s ease;
}

.input-bar.hidden {
  display: none;
}

.input-context {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-top: 6px;
  padding-bottom: 3px;
  font-size: 10px;
  font-family: 'Cascadia Code', Consolas, monospace;
  line-height: 1;
}

.input-cwd {
  color: var(--ui-accent);
  opacity: 0.8;
}

.input-separator {
  color: var(--ui-border);
}

.input-branch {
  color: var(--ui-fg-muted);
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 8px;
}

.input-prompt {
  color: var(--ui-accent);
  font-size: 14px;
  font-family: 'Cascadia Code', Consolas, monospace;
  flex-shrink: 0;
  line-height: 1;
}

.input-field {
  flex: 1;
  background: transparent;
  border: none;
  padding: 4px 0;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 13px;
  outline: none;
}

.input-field:disabled {
  opacity: 0.4;
}

.history-list {
  border-top: 1px solid var(--ui-border);
  padding: 4px 0 6px;
}

.history-header {
  font-size: 9px;
  color: var(--ui-fg-muted);
  padding-bottom: 4px;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 4px;
  cursor: pointer;
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 11px;
  border-left: 2px solid transparent;
}

.history-item:hover,
.history-item.selected {
  background: rgba(91, 156, 246, 0.12);
  border-left-color: var(--ui-accent);
}

.history-prompt {
  color: var(--ui-accent);
  font-size: 10px;
  flex-shrink: 0;
}

.history-command {
  flex: 1;
  color: var(--ui-fg-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-item.selected .history-command {
  color: var(--ui-accent);
}
</style>
