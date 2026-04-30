import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App.vue';
import { useEditorStore } from './stores/editorStore';
import { useTerminalStore } from './stores/terminalStore';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: vi.fn(() => ({
    isMaximized: vi.fn(() => Promise.resolve(false)),
    listen: vi.fn(() => Promise.resolve(() => undefined)),
  })),
}));

function mountApp() {
  return mount(App, {
    global: {
      stubs: {
        SidebarPanel: { template: '<aside class="sidebar-stub" />' },
        TabBar: { template: '<div class="tabbar-stub" />' },
        TerminalTab: { props: ['tabId', 'active'], template: '<div class="terminal-tab-stub" />' },
        SettingsModal: { props: ['visible'], template: '<div class="settings-stub" />' },
      },
    },
  });
}

describe('App editor layout', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('hides the editor pane when no files are open', () => {
    const wrapper = mountApp();

    expect(wrapper.find('.file-editor-pane').exists()).toBe(false);
    expect(wrapper.find('.terminal-workspace').exists()).toBe(true);
    expect(wrapper.text()).toContain('从顶部标签栏新建 PowerShell session 开始使用。');
  });

  it('renders the editor above the terminal workspace when files are open', () => {
    const editorStore = useEditorStore();
    editorStore.files.push({
      path: 'C:/project/App.vue',
      name: 'App.vue',
      content: '<template />',
      savedContent: '<template />',
      loading: false,
      saving: false,
      error: '',
    });
    editorStore.setActiveFile('C:/project/App.vue');

    const wrapper = mountApp();

    expect(wrapper.find('.file-editor-pane').exists()).toBe(true);
    expect(wrapper.find('.content-layout').element.children[0].classList.contains('file-editor-pane')).toBe(true);
    expect(wrapper.find('.content-layout').element.children[1].classList.contains('terminal-workspace')).toBe(true);
    expect(wrapper.get('.file-editor-pane').classes()).toContain('file-editor-pane');
  });

  it('saves the active editor file on Ctrl+S', async () => {
    const editorStore = useEditorStore();
    const saveActiveFile = vi.spyOn(editorStore, 'saveActiveFile').mockResolvedValue(true);
    editorStore.files.push({
      path: 'C:/project/App.vue',
      name: 'App.vue',
      content: 'changed',
      savedContent: 'old',
      loading: false,
      saving: false,
      error: '',
    });
    editorStore.setActiveFile('C:/project/App.vue');
    mountApp();
    const event = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(true);
    expect(saveActiveFile).toHaveBeenCalledTimes(1);
  });

  it('does not save the active editor file on plain s', async () => {
    const editorStore = useEditorStore();
    const saveActiveFile = vi.spyOn(editorStore, 'saveActiveFile').mockResolvedValue(true);
    editorStore.files.push({
      path: 'C:/project/App.vue',
      name: 'App.vue',
      content: 'changed',
      savedContent: 'old',
      loading: false,
      saving: false,
      error: '',
    });
    editorStore.setActiveFile('C:/project/App.vue');
    mountApp();
    const event = new KeyboardEvent('keydown', { key: 's', bubbles: true, cancelable: true });

    window.dispatchEvent(event);
    await Promise.resolve();

    expect(event.defaultPrevented).toBe(false);
    expect(saveActiveFile).not.toHaveBeenCalled();
  });

  it('keeps terminal shortcuts working when no editor file is active', () => {
    const store = useTerminalStore();
    const createTab = vi.spyOn(store, 'createTab');
    mountApp();
    const event = new KeyboardEvent('keydown', { key: 't', ctrlKey: true, bubbles: true, cancelable: true });

    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(createTab).toHaveBeenCalledWith('powershell');
  });
});
