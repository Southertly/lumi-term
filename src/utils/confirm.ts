import { createApp, h } from 'vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import type { ConfirmDialogProps } from '../components/ConfirmDialog.types';

let dialogContainer: HTMLDivElement | null = null;

function ensureContainer() {
  if (!dialogContainer) {
    dialogContainer = document.createElement('div');
    dialogContainer.id = 'confirm-dialog-container';
    document.body.appendChild(dialogContainer);
  }
  return dialogContainer;
}

export function confirm(options: ConfirmDialogProps | string): Promise<boolean> {
  const container = ensureContainer();
  const wrapper = document.createElement('div');
  container.appendChild(wrapper);

  const props: ConfirmDialogProps = typeof options === 'string'
    ? { message: options }
    : options;

  return new Promise((resolve) => {
    const app = createApp({
      render() {
        return h(ConfirmDialog, {
          ...props,
          onConfirm: () => {
            app.unmount();
            container.removeChild(wrapper);
            resolve(true);
          },
          onCancel: () => {
            app.unmount();
            container.removeChild(wrapper);
            resolve(false);
          },
        });
      },
    });

    app.mount(wrapper);
  });
}
