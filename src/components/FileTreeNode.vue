<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core';
import { nextTick, ref } from 'vue';
import { showError } from '../utils/toast';
import { confirm } from '../utils/confirm';

interface FileEntry {
  name: string;
  path: string;
  kind: 'file' | 'folder';
  extension: string;
}

const props = defineProps<{
  entry: FileEntry;
  depth: number;
}>();

const emit = defineEmits<{
  refresh: [];
  'open-file': [path: string];
}>();

const expanded = ref(false);
const loading = ref(false);
const children = ref<FileEntry[]>([]);

const renaming = ref(false);
const renameInput = ref('');
const renameInputRef = ref<HTMLInputElement | null>(null);

const contextMenu = ref({ visible: false, x: 0, y: 0 });

// Global request queue to prevent duplicate directory listings
const pendingRequests = new Map<string, Promise<FileEntry[]>>();

const fileIcons: Record<string, string> = {
  rs: '🦀', vue: '💚', ts: '📜', js: '📜', tsx: '📜', jsx: '📜',
  json: '📋', toml: '⚙️', yaml: '⚙️', yml: '⚙️',
  md: '📝', txt: '📝', log: '📝',
  png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️', svg: '🖼️', ico: '🖼️',
  html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
  py: '🐍', rb: '💎', go: '🔷', java: '☕', c: '🔧', cpp: '🔧', h: '🔧',
  sh: '🐚', bat: '🐚', ps1: '🐚',
  lock: '🔒', gitignore: '🙈',
  exe: '⚡', msi: '⚡', dll: '⚡',
};

const getIcon = () => {
  if (props.entry.kind === 'folder') return expanded.value ? '📂' : '📁';
  return fileIcons[props.entry.extension] || '📄';
};

const toggle = async () => {
  if (renaming.value) return;
  if (props.entry.kind !== 'folder') return;
  if (expanded.value) {
    expanded.value = false;
    return;
  }

  // Check if there's already a pending request for this path
  const pending = pendingRequests.get(props.entry.path);
  if (pending) {
    children.value = await pending;
    expanded.value = true;
    return;
  }

  if (children.value.length === 0) {
    loading.value = true;
    try {
      const request = invoke<FileEntry[]>('list_directory', { path: props.entry.path });
      pendingRequests.set(props.entry.path, request);
      children.value = await request;
    } catch {
      children.value = [];
    } finally {
      loading.value = false;
      pendingRequests.delete(props.entry.path);
    }
  }
  expanded.value = true;
};

const refreshChildren = async () => {
  if (props.entry.kind !== 'folder') return;
  try {
    children.value = await invoke<FileEntry[]>('list_directory', { path: props.entry.path });
  } catch {
    children.value = [];
  }
};

const openFile = () => {
  if (renaming.value || props.entry.kind !== 'file') return;
  emit('open-file', props.entry.path);
};

const startRename = () => {
  closeContextMenu();
  renaming.value = true;
  renameInput.value = props.entry.name;
  void nextTick(() => {
    renameInputRef.value?.focus();
    renameInputRef.value?.select();
  });
};

const confirmRename = async () => {
  const newName = renameInput.value.trim();
  if (!newName || newName === props.entry.name) {
    renaming.value = false;
    return;
  }
  try {
    await invoke<string>('rename_path_cmd', { oldPath: props.entry.path, newName });
    emit('refresh');
  } catch (e) {
    showError(String(e));
  }
  renaming.value = false;
};

const cancelRename = () => {
  renaming.value = false;
};

const onContextMenu = (event: MouseEvent) => {
  event.preventDefault();
  event.stopPropagation();
  contextMenu.value = { visible: true, x: event.clientX, y: event.clientY };
};

const closeContextMenu = () => {
  contextMenu.value.visible = false;
};

const handleNewFile = async () => {
  closeContextMenu();
  const name = prompt('新建文件名:');
  if (!name?.trim()) return;
  try {
    await invoke<string>('create_file_cmd', { parentPath: props.entry.path, name: name.trim() });
    if (props.entry.kind === 'folder') {
      expanded.value = true;
      await refreshChildren();
    }
    emit('refresh');
  } catch (e) {
    showError(String(e));
  }
};

const handleNewFolder = async () => {
  closeContextMenu();
  const name = prompt('新建文件夹名:');
  if (!name?.trim()) return;
  try {
    await invoke<string>('create_folder_cmd', { parentPath: props.entry.path, name: name.trim() });
    if (props.entry.kind === 'folder') {
      expanded.value = true;
      await refreshChildren();
    }
    emit('refresh');
  } catch (e) {
    showError(String(e));
  }
};

const handleDelete = async () => {
  closeContextMenu();
  const label = props.entry.kind === 'folder' ? '文件夹' : '文件';
  if (!await confirm(`确定删除${label}「${props.entry.name}」？`)) return;
  try {
    await invoke('delete_path_cmd', { path: props.entry.path });
    emit('refresh');
  } catch (e) {
    showError(String(e));
  }
};
</script>

<template>
  <div class="tree-node">
    <div
      class="tree-row"
      :style="{ paddingLeft: `${depth * 16 + 8}px` }"
      @click="toggle"
      @contextmenu.prevent="onContextMenu"
    >
      <span
        class="tree-chevron"
        :class="{ expanded, invisible: entry.kind !== 'folder' }"
      >▸</span>
      <span class="tree-icon">{{ getIcon() }}</span>
      <input
        v-if="renaming"
        ref="renameInputRef"
        v-model="renameInput"
        class="tree-rename-input"
        @blur="confirmRename"
        @keydown.enter.prevent="confirmRename"
        @keydown.escape.prevent="cancelRename"
        @click.stop
      />
      <span v-else class="tree-name" :title="entry.path" @dblclick.stop="openFile">{{ entry.name }}</span>
    </div>
    <div v-if="loading" class="tree-loading" :style="{ paddingLeft: `${(depth + 1) * 16 + 8}px` }">
      加载中…
    </div>
    <template v-if="expanded && !loading">
      <FileTreeNode
        v-for="child in children"
        :key="child.path"
        :entry="child"
        :depth="depth + 1"
        @refresh="refreshChildren"
        @open-file="emit('open-file', $event)"
      />
    </template>
    <Teleport to="body">
      <div v-if="contextMenu.visible" class="context-menu-backdrop" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu">
        <div class="context-menu" :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }">
          <button v-if="entry.kind === 'folder'" @click="handleNewFile">📄 新建文件</button>
          <button v-if="entry.kind === 'folder'" @click="handleNewFolder">📁 新建文件夹</button>
          <button @click="startRename">✏️ 重命名</button>
          <div v-if="entry.kind === 'folder'" class="context-divider"></div>
          <button class="danger" @click="handleDelete">🗑️ 删除</button>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.tree-row {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  color: var(--ui-fg);
  user-select: none;
}

.tree-row:hover {
  background: var(--ui-bg-lighter);
}

.tree-chevron {
  width: 16px;
  text-align: center;
  font-size: 10px;
  transition: transform 0.15s ease;
  flex-shrink: 0;
}

.tree-chevron.expanded {
  transform: rotate(90deg);
}

.tree-chevron.invisible {
  visibility: hidden;
}

.tree-icon {
  width: 16px;
  text-align: center;
  font-size: 13px;
  flex-shrink: 0;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tree-rename-input {
  flex: 1;
  min-width: 0;
  height: 20px;
  border: 1px solid var(--ui-accent);
  border-radius: 3px;
  background: var(--ui-bg-light);
  color: var(--ui-fg);
  padding: 0 4px;
  font-size: 12px;
  outline: none;
}

.tree-loading {
  padding: 3px 8px;
  font-size: 11px;
  color: var(--ui-fg-muted);
}
</style>

<style>
.context-menu-backdrop {
  position: fixed;
  inset: 0;
  z-index: 99;
}

.context-menu {
  position: fixed;
  z-index: 100;
  min-width: 160px;
  padding: 4px;
  border: 1px solid var(--ui-border);
  border-radius: 8px;
  background: var(--ui-menu-bg);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
}

.context-menu button {
  width: 100%;
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--ui-fg);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.context-menu button:hover {
  background: var(--ui-menu-hover);
}

.context-menu button.danger {
  color: #f38ba8;
}

.context-divider {
  height: 1px;
  margin: 4px 6px;
  background: var(--ui-border);
}
</style>
