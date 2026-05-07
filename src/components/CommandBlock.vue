<script setup lang="ts">
import type { CommandBlock } from '../stores/commandBlockStore';

defineProps<{ block: CommandBlock }>();

function formatDuration(block: CommandBlock): string {
  if (!block.endTime) return '';
  const ms = block.endTime - block.startTime;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
</script>

<template>
  <div class="cmd-block" :class="block.status">
    <div class="cmd-block-header">
      <span class="cmd-block-status-icon">
        <span v-if="block.status === 'running'">⏳</span>
        <span v-else-if="block.status === 'success'">✓</span>
        <span v-else>✗</span>
      </span>
      <span class="cmd-block-command">{{ block.command }}</span>
      <span class="cmd-block-duration">{{ formatDuration(block) }}</span>
    </div>
    <pre v-if="block.output" class="cmd-block-output">{{ block.output }}</pre>
  </div>
</template>

<style scoped>
.cmd-block {
  border-left: 2px solid var(--ui-border, #444);
  margin: 4px 0;
  border-radius: 0 4px 4px 0;
  background: rgba(0, 0, 0, 0.2);
  font-family: inherit;
  font-size: 12px;
}

.cmd-block.success { border-left-color: #4caf50; }
.cmd-block.error   { border-left-color: #f44336; }
.cmd-block.running { border-left-color: #ff9800; }

.cmd-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  color: var(--ui-fg, #ccc);
}

.cmd-block-command {
  flex: 1;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-block-duration {
  color: var(--ui-fg-muted, #888);
  font-size: 10px;
}

.cmd-block-output {
  margin: 0;
  padding: 4px 8px 6px 24px;
  color: var(--ui-fg-muted, #aaa);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
</style>
