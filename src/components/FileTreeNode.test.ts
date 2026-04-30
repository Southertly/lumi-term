import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import FileTreeNode from './FileTreeNode.vue';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('FileTreeNode', () => {
  it('emits open-file when a file name is double clicked', async () => {
    const wrapper = mount(FileTreeNode, {
      props: {
        entry: { name: 'App.vue', path: 'C:/project/src/App.vue', kind: 'file', extension: 'vue' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-name').trigger('dblclick');

    expect(wrapper.emitted('open-file')).toEqual([['C:/project/src/App.vue']]);
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it('does not emit open-file when a folder name is double clicked', async () => {
    const wrapper = mount(FileTreeNode, {
      props: {
        entry: { name: 'src', path: 'C:/project/src', kind: 'folder', extension: '' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-name').trigger('dblclick');

    expect(wrapper.emitted('open-file')).toBeUndefined();
  });

  it('forwards open-file from child nodes', async () => {
    invokeMock.mockResolvedValueOnce([
      { name: 'main.ts', path: 'C:/project/src/main.ts', kind: 'file', extension: 'ts' },
    ]);
    const wrapper = mount(FileTreeNode, {
      props: {
        entry: { name: 'src', path: 'C:/project/src', kind: 'folder', extension: '' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-row').trigger('click');
    await wrapper.findAll('.tree-name')[1].trigger('dblclick');

    expect(wrapper.emitted('open-file')).toEqual([['C:/project/src/main.ts']]);
  });

  it('keeps rename available from the context menu', async () => {
    const wrapper = mount(FileTreeNode, {
      attachTo: document.body,
      props: {
        entry: { name: 'App.vue', path: 'C:/project/src/App.vue', kind: 'file', extension: 'vue' },
        depth: 0,
      },
    });

    await wrapper.get('.tree-row').trigger('contextmenu');
    await document.querySelectorAll<HTMLButtonElement>('.context-menu button')[0].click();

    expect(wrapper.find('.tree-rename-input').exists()).toBe(true);
    wrapper.unmount();
  });
});
