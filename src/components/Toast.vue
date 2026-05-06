<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

export interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

const props = withDefaults(defineProps<ToastProps>(), {
  type: 'info',
  duration: 5000,
});

const emit = defineEmits<{
  close: [];
}>();

const visible = ref(false);

const iconMap = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
  warning: '⚠',
};

const icon = computed(() => iconMap[props.type]);

onMounted(() => {
  visible.value = true;
  if (props.duration > 0) {
    setTimeout(() => {
      close();
    }, props.duration);
  }
});

function close() {
  visible.value = false;
  setTimeout(() => {
    emit('close');
  }, 300);
}
</script>

<template>
  <div
    v-if="visible"
    class="toast"
    :class="`toast-${type}`"
    @click="close"
  >
    <span class="toast-icon">{{ icon }}</span>
    <span class="toast-message">{{ message }}</span>
  </div>
</template>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  right: 20px;
  min-width: 250px;
  max-width: 400px;
  padding: 12px 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  animation: slideIn 0.3s ease;
  z-index: 9999;
  font-size: 14px;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.toast-icon {
  font-size: 18px;
  font-weight: bold;
  flex-shrink: 0;
}

.toast-message {
  flex: 1;
  word-break: break-word;
}

.toast-success {
  background: #10b981;
  color: white;
}

.toast-error {
  background: #ef4444;
  color: white;
}

.toast-info {
  background: #3b82f6;
  color: white;
}

.toast-warning {
  background: #f59e0b;
  color: white;
}
</style>
