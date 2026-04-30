import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FileEditorPane from './FileEditorPane.vue';
import { nextTick } from 'vue';
import { useEditorStore } from '../stores/editorStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('FileEditorPane', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
  });

  it('renders editor tabs and active file content', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: '<template />' })
      .mockResolvedValueOnce({ path: 'C:/Project/main.ts', name: 'main.ts', content: 'createApp()' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');
    await store.openFile('C:/Project/main.ts');

    const wrapper = mount(FileEditorPane);

    expect(wrapper.text()).toContain('App.vue');
    expect(wrapper.text()).toContain('main.ts');
    expect(wrapper.get('textarea').element.value).toBe('createApp()');
    expect(wrapper.text()).toContain('C:/Project/main.ts');
  });

  it('shows loading state before file content resolves', async () => {
    let resolveRead!: (payload: { path: string; name: string; content: string }) => void;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const store = useEditorStore();

    const openPromise = store.openFile('C:/Project/slow.txt');
    const wrapper = mount(FileEditorPane);

    expect(wrapper.text()).toContain('slow.txt');
    expect(wrapper.text()).toContain('加载中');
    expect(wrapper.find('textarea').exists()).toBe(false);

    resolveRead({ path: 'C:/Project/slow.txt', name: 'slow.txt', content: 'loaded' });
    await openPromise;
    await nextTick();

    expect(wrapper.get('textarea').element.value).toBe('loaded');
  });

  it('updates content and shows dirty marker', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('textarea').setValue('new');

    expect(store.activeFile?.content).toBe('new');
    expect(wrapper.text()).toContain('●');
    expect(wrapper.text()).toContain('未保存');
  });

  it('switches active editor tab', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'A' })
      .mockResolvedValueOnce({ path: 'C:/Project/main.ts', name: 'main.ts', content: 'B' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');
    await store.openFile('C:/Project/main.ts');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('button[aria-label="切换到 App.vue"]').trigger('click');

    expect(store.activePath).toBe('C:/Project/App.vue');
    expect(wrapper.get('textarea').element.value).toBe('A');
  });

  it('saves active file from toolbar button', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    invokeMock.mockResolvedValueOnce(undefined);
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('textarea').setValue('new');
    await wrapper.get('button[aria-label="保存当前文件"]').trigger('click');

    expect(invokeMock).toHaveBeenLastCalledWith('write_text_file_cmd', {
      path: 'C:/Project/App.vue',
      content: 'new',
    });
  });

  it('closes file from tab close button', async () => {
    invokeMock.mockResolvedValueOnce({ path: 'C:/Project/App.vue', name: 'App.vue', content: 'old' });
    const store = useEditorStore();
    await store.openFile('C:/Project/App.vue');

    const wrapper = mount(FileEditorPane);
    await wrapper.get('button[aria-label="关闭 App.vue"]').trigger('click');

    expect(store.files).toHaveLength(0);
  });
});
