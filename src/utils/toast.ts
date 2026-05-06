import { createApp, h } from 'vue';
import Toast, { type ToastProps } from '../components/Toast.vue';

let toastContainer: HTMLDivElement | null = null;

function ensureContainer() {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = 'toast-container';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

function showToast(props: ToastProps) {
  const container = ensureContainer();
  const wrapper = document.createElement('div');
  container.appendChild(wrapper);

  const app = createApp({
    render() {
      return h(Toast, {
        ...props,
        onClose: () => {
          app.unmount();
          container.removeChild(wrapper);
        },
      });
    },
  });

  app.mount(wrapper);
}

export function showError(message: string, duration = 5000) {
  showToast({ message, type: 'error', duration });
}

export function showSuccess(message: string, duration = 3000) {
  showToast({ message, type: 'success', duration });
}

export function showInfo(message: string, duration = 4000) {
  showToast({ message, type: 'info', duration });
}

export function showWarning(message: string, duration = 4000) {
  showToast({ message, type: 'warning', duration });
}
