<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue';
import { useHistoryStore, type HistoryEntry } from '../stores/historyStore';

const props = defineProps<{
  visible: boolean;
}>();

const emit = defineEmits<{
  select: [command: string];
  close: [];
}>();

const historyStore = useHistoryStore();
const query = ref('');
const selectedIndex = ref(0);
const searchRef = ref<HTMLInputElement | null>(null);

const results = computed<HistoryEntry[]>(() =>
  historyStore.search(query.value).slice(0, 8)
);

watch(() => props.visible, (visible) => {
  if (visible) {
    query.value = '';
    selectedIndex.value = 0;
    nextTick(() => searchRef.value?.focus());
  }
});

watch(results, () => {
  selectedIndex.value = 0;
});

function formatAge(lastUsedAt: number): string {
  const mins = Math.floor((Date.now() - lastUsedAt) / 60_000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}小时前`;
  return `${Math.floor(hours / 24)}天前`;
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault();
    emit('close');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex.value = Math.max(0, selectedIndex.value - 1);
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex.value = Math.min(results.value.length - 1, selectedIndex.value + 1);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (results.value[selectedIndex.value]) {
      emit('select', results.value[selectedIndex.value].command);
    }
  }
}

function selectItem(command: string) {
  emit('select', command);
}
</script>

<template>
  <div v-if="visible" class="history-search" @click.stop>
    <div class="hs-header">
      <span class="hs-icon">🔍</span>
      <input
        ref="searchRef"
        v-model="query"
        class="hs-input"
        type="text"
        placeholder="搜索历史命令…"
        autocomplete="off"
        @keydown="handleKeydown"
      />
      <span class="hs-close" @click="emit('close')">ESC</span>
    </div>
    <div class="hs-list">
      <div
        v-for="(entry, idx) in results"
        :key="entry.command"
        class="hs-item"
        :class="{ selected: idx === selectedIndex }"
        @click="selectItem(entry.command)"
        @mouseover="selectedIndex = idx"
      >
        <span class="hs-prompt">❯</span>
        <span class="hs-command">{{ entry.command }}</span>
        <span class="hs-age">{{ formatAge(entry.lastUsedAt) }}</span>
      </div>
      <div v-if="results.length === 0" class="hs-empty">
        无匹配命令
      </div>
    </div>
  </div>
</template>

<style scoped>
.history-search {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 60px; /* above InputBar */
  z-index: 200;
  background: var(--ui-bg-lighter);
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  font-family: 'Cascadia Code', Consolas, monospace;
}

.hs-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--ui-border);
}

.hs-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.hs-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--ui-fg);
  font-family: 'Cascadia Code', Consolas, monospace;
  font-size: 12px;
}

.hs-input::placeholder {
  color: var(--ui-fg-muted);
}

.hs-close {
  color: var(--ui-fg-muted);
  font-size: 9px;
  cursor: pointer;
  border: 1px solid var(--ui-border);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
}

.hs-list {
  max-height: 220px;
  overflow-y: auto;
}

.hs-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background 0.1s;
}

.hs-item.selected {
  background: color-mix(in srgb, var(--ui-accent) 15%, transparent);
}

.hs-prompt {
  color: var(--ui-accent);
  font-size: 10px;
  flex-shrink: 0;
}

.hs-command {
  flex: 1;
  color: var(--ui-fg);
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.hs-age {
  color: var(--ui-fg-muted);
  font-size: 9px;
  flex-shrink: 0;
}

.hs-empty {
  padding: 12px;
  color: var(--ui-fg-muted);
  font-size: 11px;
  text-align: center;
}
</style>
