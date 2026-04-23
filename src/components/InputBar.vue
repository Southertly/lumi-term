<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useHistoryStore } from '../stores/historyStore';

const props = defineProps<{
  sessionId: string | null;
  isInteractive: boolean;
  cwd: string;
  gitBranch: string;
}>();

const emit = defineEmits<{
  openHistorySearch: [];
}>();

const historyStore = useHistoryStore();
const inputValue = ref('');
const historyIndex = ref(-1);
const inputRef = ref<HTMLInputElement | null>(null);

// When interactive mode ends, auto-focus the input bar
watch(() => props.isInteractive, (interactive) => {
  if (!interactive) {
    nextTick(() => inputRef.value?.focus());
  }
});

function displayCwd(cwd: string): string {
  if (!cwd) return '';
  // Replace Windows-style home dir with ~
  const home = cwd.match(/^[A-Z]:\\Users\\[^\\]+/i)?.[0] ?? '';
  if (home && cwd.startsWith(home)) {
    return '~' + cwd.slice(home.length).replace(/\\/g, '/');
  }
  return cwd.replace(/\\/g, '/');
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') {
    e.preventDefault();
    sendCommand();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    navigateHistory(-1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    navigateHistory(1);
  } else if (e.ctrlKey && e.key === 'r') {
    e.preventDefault();
    emit('openHistorySearch');
  }
}

function navigateHistory(direction: -1 | 1) {
  const list = historyStore.list();
  if (list.length === 0) return;

  // Down from empty input does nothing
  if (direction === 1 && historyIndex.value === -1) return;

  if (historyIndex.value === -1 && direction === -1) {
    historyIndex.value = 0;
  } else {
    const next = historyIndex.value + direction;
    historyIndex.value = Math.max(-1, Math.min(list.length - 1, next));
  }

  inputValue.value = historyIndex.value === -1 ? '' : list[historyIndex.value].command;
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
  historyIndex.value = -1;
}

function fillCommand(command: string) {
  inputValue.value = command;
  historyIndex.value = -1;
  nextTick(() => inputRef.value?.focus());
}

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
      />
      <span class="input-hints">↑↓ 历史&nbsp;&nbsp;⌅ 发送</span>
    </div>
  </div>
</template>

<style scoped>
.input-bar {
  background: var(--ui-bg-lighter);
  border-top: 1px solid var(--ui-border);
  padding: 0 14px;
  flex-shrink: 0;
  overflow: hidden;
  transition: height 0.15s ease, opacity 0.15s ease;
  height: 52px;
  opacity: 1;
}

.input-bar.hidden {
  height: 0;
  opacity: 0;
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
  padding-bottom: 7px;
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
  background: var(--ui-bg-light);
  border: 1px solid var(--ui-border);
  border-radius: 5px;
  padding: 5px 10px;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
  outline: none;
  transition: border-color 0.1s;
}

.input-field:focus {
  border-color: var(--ui-accent);
}

.input-field:disabled {
  opacity: 0.4;
}

.input-hints {
  color: var(--ui-fg-muted);
  font-size: 9px;
  white-space: nowrap;
  flex-shrink: 0;
}
</style>
