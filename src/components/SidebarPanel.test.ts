import { mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SidebarPanel from './SidebarPanel.vue';
import { useEditorStore } from '../stores/editorStore';
import { useTerminalStore } from '../stores/terminalStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

function stubDeterministicIds() {
  let nextId = 0;
  vi.stubGlobal('crypto', {
    randomUUID: vi.fn(() => `id-${++nextId}`),
  });
}

function mountSidebar() {
  return mount(SidebarPanel, {
    attachTo: document.body,
    global: {
      stubs: {
        FileTreeNode: {
          props: ['entry', 'depth'],
          emits: ['refresh', 'open-file'],
          template: '<button type="button" class="file-tree-node-stub" @click="$emit(\'open-file\', entry.path)">{{ entry.name }}</button>',
        },
      },
    },
  });
}

describe('SidebarPanel', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    invokeMock.mockReset();
    invokeMock.mockImplementation((command: string, args?: Record<string, unknown>) => {
      if (command === 'list_directory') {
        return Promise.resolve([
          { name: 'src', path: `${args?.path}/src`, kind: 'folder', extension: '' },
          { name: 'package.json', path: `${args?.path}/package.json`, kind: 'file', extension: 'json' },
        ]);
      }
      if (command === 'list_workspace_roots') {
        return Promise.resolve([
          { name: 'C:', path: 'C:/', kind: 'drive' },
        ]);
      }
      if (command === 'list_workspace_children') {
        return Promise.resolve([
          { name: 'Project', path: 'C:/Project', kind: 'folder' },
        ]);
      }
      if (command === 'validate_workspace_path') {
        return Promise.resolve(args?.path);
      }
      if (command === 'search_files_cmd') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    setActivePinia(createPinia());
    vi.unstubAllGlobals();
    stubDeterministicIds();
  });

  it('renders the active workspace and loads its root entries', async () => {
    const store = useTerminalStore();
    store.setCurrentWorkspace('C:/Project');

    const wrapper = mountSidebar();
    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('list_directory', { path: 'C:/Project' });
      expect(wrapper.get('.sidebar-tab').text()).toContain('文件');
      expect(wrapper.text()).toContain('Project');
      expect(wrapper.text()).toContain('package.json');
    });
  });

  it('toggle button collapses and expands the existing sidebar', async () => {
    const wrapper = mountSidebar();
    const store = useTerminalStore();

    await wrapper.get('button.panel-toggle-button').trigger('click');
    expect(store.sidebarCollapsed).toBe(true);
    expect(wrapper.classes()).toContain('collapsed');

    await wrapper.get('button.panel-toggle-button').trigger('click');
    expect(store.sidebarCollapsed).toBe(false);
  });

  it('opens the workspace menu at the selected folder instead of drive roots', async () => {
    const store = useTerminalStore();
    store.setCurrentWorkspace('C:/Project');

    const wrapper = mountSidebar();
    await wrapper.get('button.workspace-button').trigger('click');

    await vi.waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('list_workspace_children', { path: 'C:/Project' });
      expect(wrapper.text()).toContain('Project');
    });
  });

  it('opens files emitted from the file tree in the editor store', async () => {
    const store = useTerminalStore();
    store.setCurrentWorkspace('C:/Project');
    const editorStore = useEditorStore();
    const openFile = vi.spyOn(editorStore, 'openFile').mockResolvedValue(null);

    const wrapper = mountSidebar();
    await vi.waitFor(() => {
      expect(wrapper.text()).toContain('package.json');
    });
    await wrapper.findAll('.file-tree-node-stub')[1].trigger('click');

    expect(openFile).toHaveBeenCalledWith('C:/Project/package.json');
  });

  it('does not render sidebar session or bottom quick actions', () => {
    const store = useTerminalStore();
    store.setCurrentWorkspace('C:/Project');
    store.createTab('powershell', 'Project Shell', 'C:/Project');

    const wrapper = mountSidebar();

    expect(wrapper.text()).not.toContain('Sessions');
    expect(wrapper.find('.session-item').exists()).toBe(false);
    expect(wrapper.find('.create-panel').exists()).toBe(false);
    expect(wrapper.find('.sidebar-footer').exists()).toBe(false);
    expect(wrapper.findAll('button').some((button) => button.text().includes('终端'))).toBe(false);
  });
});
