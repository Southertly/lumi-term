<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useCommandBlockStore, type CommandBlock } from '../stores/commandBlockStore';

const props = defineProps<{ paneId: string }>();

const blockStore = useCommandBlockStore();
const expanded = ref(false);

const allBlocks = computed(() => blockStore.getBlocks(props.paneId));
const recentBlocks = computed(() => {
  const blocks = allBlocks.value;
  return blocks.slice(-3);
});

function toggle() {
  expanded.value = !expanded.value;
}

function statusIcon(block: CommandBlock): string {
  if (block.status === 'running') return '⏳';
  if (block.status === 'success') return '✓';
  return '✗';
}

function formatDuration(block: CommandBlock): string {
  if (block.status === 'running') return '运行中';
  if (!block.endTime) return '';
  const ms = block.endTime - block.startTime;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

function truncate(text: string, max = 24): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

const wrapperRef = ref<HTMLElement | null>(null);

function onOutsideClick(e: MouseEvent) {
  if (expanded.value && wrapperRef.value && !wrapperRef.value.contains(e.target as Node)) {
    expanded.value = false;
  }
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') expanded.value = false;
}

onMounted(() => {
  document.addEventListener('click', onOutsideClick);
  document.addEventListener('keydown', onKeyDown);
});

onUnmounted(() => {
  document.removeEventListener('click', onOutsideClick);
  document.removeEventListener('keydown', onKeyDown);
});
</script>

<template>
  <div v-if="allBlocks.length > 0" ref="wrapperRef" class="status-bar-wrapper">
    <!-- History panel (expands upward) -->
    <!-- CSS max-height transition requires class toggle, not v-show (display:none breaks animation) -->
    <div class="history-panel" :class="{ expanded }">
      <div class="history-header">
        <span>命令历史</span>
        <span class="collapse-hint">▲ 收起</span>
      </div>
      <div class="history-list">
        <div
          v-for="block in allBlocks"
          :key="block.id"
          class="history-item"
          :class="block.status"
        >
          <span class="history-icon">{{ statusIcon(block) }}</span>
          <span class="history-command">{{ block.command || '(空命令)' }}</span>
          <span class="history-duration">{{ formatDuration(block) }}</span>
        </div>
      </div>
    </div>

    <!-- Status bar -->
    <div class="status-bar" @click="toggle" :title="expanded ? '收起历史' : '展开历史'">
      <div
        v-for="block in recentBlocks"
        :key="block.id"
        class="status-item"
        :class="block.status"
      >
        <span class="status-icon">{{ statusIcon(block) }}</span>
        <span class="status-command">{{ truncate(block.command || '(空命令)') }}</span>
        <span class="status-duration">{{ formatDuration(block) }}</span>
      </div>
      <span v-if="allBlocks.length > 3" class="status-more">+{{ allBlocks.length - 3 }}</span>
      <span class="status-toggle">{{ expanded ? '▲' : '▼' }}</span>
    </div>
  </div>
</template>

<style scoped>
.status-bar-wrapper {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 20;
  font-family: inherit;
  font-size: 11px;
}

/* History panel */
.history-panel {
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 95%, transparent 5%);
  border-top: 1px solid var(--ui-border, #333);
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.15s ease;
}

.history-panel.expanded {
  max-height: 200px;
  overflow-y: auto;
}

.history-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 10px;
  color: var(--ui-fg-muted, #888);
  font-size: 10px;
  border-bottom: 1px solid var(--ui-border, #333);
}

.collapse-hint {
  font-size: 9px;
  opacity: 0.6;
}

.history-list {
  padding: 2px 0;
}

.history-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  color: var(--ui-fg-muted, #aaa);
}

.history-item:hover {
  background: var(--ui-hover, rgba(255,255,255,0.05));
}

.history-icon {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.history-item.success .history-icon { color: #4caf50; }
.history-item.error   .history-icon { color: #f44336; }
.history-item.running .history-icon { color: #ff9800; }

.history-command {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--ui-fg, #ccc);
}

.history-duration {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  flex-shrink: 0;
}

/* Status bar */
.status-bar {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 10px;
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 92%, transparent 8%);
  border-top: 1px solid var(--ui-border, #333);
  cursor: pointer;
  user-select: none;
}

.status-bar:hover {
  background: color-mix(in srgb, var(--ui-bg, #1a1a2e) 85%, var(--ui-accent, #4a9eff) 15%);
}

.status-item {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}

.status-icon {
  flex-shrink: 0;
}

.status-item.success .status-icon { color: #4caf50; }
.status-item.error   .status-icon { color: #f44336; }
.status-item.running .status-icon { color: #ff9800; }

.status-command {
  color: var(--ui-fg, #ccc);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 120px;
}

.status-duration {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  flex-shrink: 0;
}

.status-more {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
  margin-left: auto;
}

.status-toggle {
  color: var(--ui-fg-muted, #666);
  font-size: 10px;
}

.status-more + .status-toggle {
  margin-left: 4px;
}

.status-bar:not(:has(.status-more)) .status-toggle {
  margin-left: auto;
}
</style>
