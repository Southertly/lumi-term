<script setup lang="ts">
import { ref } from 'vue';

export interface ConfirmDialogProps {
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'warning' | 'danger' | 'info';
}

withDefaults(defineProps<ConfirmDialogProps>(), {
  title: '确认',
  confirmText: '确定',
  cancelText: '取消',
  type: 'warning',
});

const emit = defineEmits<{
  confirm: [];
  cancel: [];
}>();

const visible = ref(true);

function handleConfirm() {
  visible.value = false;
  emit('confirm');
}

function handleCancel() {
  visible.value = false;
  emit('cancel');
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault();
    handleConfirm();
  } else if (event.key === 'Escape') {
    event.preventDefault();
    handleCancel();
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="dialog-overlay"
      @click="handleCancel"
      @keydown="handleKeydown"
    >
      <div
        class="dialog-container"
        :class="`dialog-${type}`"
        @click.stop
      >
        <div class="dialog-header">
          <h3>{{ title }}</h3>
        </div>
        <div class="dialog-body">
          <p>{{ message }}</p>
        </div>
        <div class="dialog-footer">
          <button
            class="dialog-button dialog-button-cancel"
            type="button"
            @click="handleCancel"
          >
            {{ cancelText }}
          </button>
          <button
            class="dialog-button dialog-button-confirm"
            type="button"
            autofocus
            @click="handleConfirm"
          >
            {{ confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.dialog-container {
  background: var(--ui-bg);
  border: 1px solid var(--ui-border);
  border-radius: 12px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  animation: slideIn 0.2s ease;
}

@keyframes slideIn {
  from {
    transform: translateY(-20px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.dialog-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--ui-border);
}

.dialog-header h3 {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--ui-fg);
}

.dialog-body {
  padding: 20px 24px;
}

.dialog-body p {
  margin: 0;
  font-size: 14px;
  line-height: 1.6;
  color: var(--ui-fg);
}

.dialog-footer {
  padding: 16px 24px 20px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.dialog-button {
  padding: 8px 16px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  border: 1px solid var(--ui-border);
}

.dialog-button-cancel {
  background: var(--ui-bg-light);
  color: var(--ui-fg);
}

.dialog-button-cancel:hover {
  background: var(--ui-bg-lighter);
}

.dialog-button-confirm {
  background: var(--ui-accent);
  color: #11111b;
  border-color: var(--ui-accent);
}

.dialog-button-confirm:hover {
  opacity: 0.9;
}

.dialog-danger .dialog-button-confirm {
  background: #ef4444;
  border-color: #ef4444;
  color: white;
}

.dialog-danger .dialog-button-confirm:hover {
  background: #dc2626;
}
</style>
