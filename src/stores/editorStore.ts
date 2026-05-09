import { invoke } from '@tauri-apps/api/core';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { confirm } from '../utils/confirm';

export interface TextFilePayload {
  path: string;
  name: string;
  content: string;
}

export interface EditorFile {
  path: string;
  name: string;
  content: string;
  savedContent: string;
  loading: boolean;
  saving: boolean;
  error: string;
}

export type ActiveEditorFile = EditorFile & { dirty: boolean };

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown editor error';
}

function fileNameFromPath(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').filter(Boolean).pop() ?? path;
}

export const useEditorStore = defineStore('editor', () => {
  const files = ref<EditorFile[]>([]);
  const activePath = ref<string | null>(null);
  const openError = ref('');
  const pendingOpens = new Map<string, Promise<EditorFile | null>>();

  const activeFile = computed<ActiveEditorFile | null>(() => {
    const file = files.value.find((item) => item.path === activePath.value);
    return file ? { ...file, dirty: file.content !== file.savedContent } : null;
  });

  const hasOpenFiles = computed(() => files.value.length > 0);
  const dirtyFiles = computed(() => files.value.filter((file) => file.content !== file.savedContent));

  function isDirty(path: string): boolean {
    const file = files.value.find((item) => item.path === path);
    return file ? file.content !== file.savedContent : false;
  }

  /**
   * Opens a file and loads its content
   *
   * Race condition prevention: Check pendingOpens BEFORE checking files.value
   * to prevent duplicate loading when openFile is called multiple times rapidly.
   *
   * Memory leak prevention: pendingOpens Map is cleaned up in the finally block
   * to ensure all error paths release the Promise reference.
   */
  async function openFile(path: string): Promise<EditorFile | null> {
    const normalizedPath = path.toLowerCase();

    // Check pending first to prevent race condition
    const pendingOpen = pendingOpens.get(normalizedPath);
    if (pendingOpen) return pendingOpen;

    const existing = files.value.find((file) => file.path.toLowerCase() === normalizedPath);
    if (existing) {
      activePath.value = existing.path;
      openError.value = '';
      return existing;
    }

    const file: EditorFile = {
      path,
      name: fileNameFromPath(path),
      content: '',
      savedContent: '',
      loading: true,
      saving: false,
      error: '',
    };
    files.value.push(file);
    activePath.value = file.path;
    openError.value = '';

    const request = invoke<TextFilePayload>('read_text_file_cmd', { path })
      .then((payload) => {
        const loadedFile: EditorFile = {
          path: payload.path,
          name: payload.name,
          content: payload.content,
          savedContent: payload.content,
          loading: false,
          saving: false,
          error: '',
        };
        const index = files.value.findIndex((f) => f.path.toLowerCase() === normalizedPath);
        if (index === -1) return null;
        files.value.splice(index, 1, loadedFile);
        activePath.value = loadedFile.path;
        return loadedFile;
      })
      .catch((error) => {
        const index = files.value.findIndex((f) => f.path.toLowerCase() === normalizedPath);
        if (index === -1) return null;
        const message = errorMessage(error);
        // Keep the tab open but show error state instead of removing it
        files.value.splice(index, 1, { ...files.value[index], loading: false, error: message });
        return null;
      })
      .finally(() => {
        pendingOpens.delete(normalizedPath);
      });

    pendingOpens.set(normalizedPath, request);
    return request;
  }

  function setActiveFile(path: string | null) {
    if (path === null || files.value.some((file) => file.path === path)) {
      activePath.value = path;
    }
  }

  function updateActiveContent(content: string) {
    const file = files.value.find((item) => item.path === activePath.value);
    if (!file) return;

    file.content = content;
    file.error = '';
  }

  async function saveActiveFile(): Promise<boolean> {
    const file = files.value.find((item) => item.path === activePath.value);
    if (!file || file.saving) return false;

    file.saving = true;
    file.error = '';

    try {
      await invoke('write_text_file_cmd', { path: file.path, content: file.content });
      file.savedContent = file.content;
      return true;
    } catch (error) {
      file.error = errorMessage(error);
      return false;
    } finally {
      file.saving = false;
    }
  }

  async function closeFile(path: string, force = false): Promise<boolean> {
    const index = files.value.findIndex((file) => file.path === path);
    if (index === -1) return false;

    const file = files.value[index];
    if (!force && file.content !== file.savedContent) {
      const shouldClose = await confirm({
        title: '关闭文件',
        message: `关闭 ${file.name}？未保存的更改会丢失。`,
        type: 'warning',
      });
      if (!shouldClose) return false;
    }

    files.value.splice(index, 1);

    if (activePath.value === path) {
      const next = files.value[index] ?? files.value[index - 1] ?? null;
      activePath.value = next?.path ?? null;
    }

    return true;
  }

  async function closeActiveFile(): Promise<boolean> {
    if (!activePath.value) return false;
    return await closeFile(activePath.value);
  }

  return {
    files,
    activePath,
    openError,
    activeFile,
    hasOpenFiles,
    dirtyFiles,
    isDirty,
    openFile,
    setActiveFile,
    updateActiveContent,
    saveActiveFile,
    closeFile,
    closeActiveFile,
  };
});
