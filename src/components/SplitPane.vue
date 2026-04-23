<script setup lang="ts">
import { ref, onUnmounted } from 'vue';

const props = defineProps<{
  direction: 'horizontal' | 'vertical';
  sizes: [number, number];
}>();

const emit = defineEmits<{
  resize: [sizes: [number, number]];
}>();

const dragging = ref(false);
let cleanupListeners: (() => void) | null = null;

function onDividerDown(e: PointerEvent) {
  e.preventDefault();
  const splitter = e.currentTarget as HTMLElement;
  const container = splitter.parentElement!;
  splitter.setPointerCapture(e.pointerId);
  dragging.value = true;

  const isVertical = props.direction === 'vertical';

  function onMove(ev: PointerEvent) {
    const rect = container.getBoundingClientRect();
    const offset = isVertical
      ? ev.clientX - rect.left
      : ev.clientY - rect.top;
    const containerSize = isVertical ? container.clientWidth : container.clientHeight;
    const pct = Math.min(80, Math.max(20, (offset / containerSize) * 100));
    emit('resize', [pct, 100 - pct]);
  }

  function onUp(ev: PointerEvent) {
    splitter.releasePointerCapture(ev.pointerId);
    dragging.value = false;
    cleanup();
  }

  function cleanup() {
    if (cleanupListeners) {
      cleanupListeners();
      cleanupListeners = null;
    }
  }

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp);
  cleanupListeners = () => {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('pointerup', onUp);
  };
}

onUnmounted(() => {
  if (cleanupListeners) cleanupListeners();
});
</script>

<template>
  <div class="split-pane" :class="direction">
    <div class="pane" :style="{ flexBasis: sizes[0] + '%' }">
      <slot name="pane-0" />
    </div>
    <div
      class="splitter"
      :class="{ [direction]: true, dragging }"
      @pointerdown="onDividerDown"
    />
    <div class="pane" :style="{ flexBasis: sizes[1] + '%' }">
      <slot name="pane-1" />
    </div>
  </div>
</template>

<style scoped>
.split-pane { display: flex; width: 100%; height: 100%; overflow: hidden; }
.split-pane.horizontal { flex-direction: column; }
.split-pane.vertical { flex-direction: row; }

.pane { overflow: hidden; min-width: 0; min-height: 0; }

.splitter {
  flex-shrink: 0;
  background: var(--ui-border);
  transition: background 0.15s ease;
  z-index: 1;
}
.splitter:hover, .splitter.dragging { background: var(--ui-accent); }
.splitter.vertical { width: 4px; cursor: col-resize; }
.splitter.horizontal { height: 4px; cursor: row-resize; }
</style>
