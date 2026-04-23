<script setup lang="ts">
import { computed } from 'vue';
import { useTerminalStore } from '../stores/terminalStore';
import TerminalPane from './TerminalPane.vue';
import SplitPane from './SplitPane.vue';

const props = defineProps<{ tabId: string; active: boolean }>();
const store = useTerminalStore();

const tab = computed(() => store.tabs.find((t) => t.id === props.tabId));
const hasSplit = computed(() => (tab.value?.panes.length ?? 0) > 1);

function onSplitResize(sizes: [number, number]) {
  if (!tab.value) return;
  store.updatePaneSizes(tab.value.id, sizes);
}
</script>

<template>
  <div v-if="tab" class="tab-content" :style="{ display: active ? 'flex' : 'none' }">
    <TerminalPane
      v-if="!hasSplit"
      :pane-id="tab.panes[0].id"
      :tab-id="tab.id"
      :shell-type="tab.panes[0].shellType"
      :active="active"
      :pane-active="true"
    />
    <SplitPane
      v-else
      :direction="tab.splitDirection!"
      :sizes="[tab.panes[0].size, tab.panes[1].size]"
      @resize="onSplitResize"
    >
      <template #pane-0>
        <TerminalPane
          :pane-id="tab.panes[0].id"
          :tab-id="tab.id"
          :shell-type="tab.panes[0].shellType"
          :active="active"
          :pane-active="tab.activePaneId === tab.panes[0].id"
        />
      </template>
      <template #pane-1>
        <TerminalPane
          :pane-id="tab.panes[1].id"
          :tab-id="tab.id"
          :shell-type="tab.panes[1].shellType"
          :active="active"
          :pane-active="tab.activePaneId === tab.panes[1].id"
        />
      </template>
    </SplitPane>
  </div>
</template>

<style scoped>
.tab-content {
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
