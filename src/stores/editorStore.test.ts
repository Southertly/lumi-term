import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './editorStore';

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

describe('editorStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    invokeMock.mockReset();
    vi.restoreAllMocks();
  });

  it('opens a file using Tauri read_text_file_cmd', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/README.md',
      name: 'README.md',
      content: 'hello',
    });
    const store = useEditorStore();

    await store.openFile('C:/project/README.md');

    expect(invokeMock).toHaveBeenCalledWith('read_text_file_cmd', { path: 'C:/project/README.md' });
    expect(store.files).toHaveLength(1);
    expect(store.files[0]).toMatchObject({
      path: 'C:/project/README.md',
      name: 'README.md',
      content: 'hello',
      savedContent: 'hello',
      loading: false,
      saving: false,
      error: '',
    });
    expect(store.activePath).toBe('C:/project/README.md');
    expect(store.activeFile?.dirty).toBe(false);
    expect(store.hasOpenFiles).toBe(true);
    expect(store.openError).toBe('');
  });

  it('shows a loading tab immediately while the file read is pending', async () => {
    let resolveRead!: (payload: { path: string; name: string; content: string }) => void;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const store = useEditorStore();

    const openPromise = store.openFile('C:/project/slow.txt');

    expect(store.hasOpenFiles).toBe(true);
    expect(store.activePath).toBe('C:/project/slow.txt');
    expect(store.files[0]).toMatchObject({
      path: 'C:/project/slow.txt',
      name: 'slow.txt',
      loading: true,
      content: '',
    });

    resolveRead({ path: 'C:/project/slow.txt', name: 'slow.txt', content: 'loaded' });
    await openPromise;

    expect(store.files[0]).toMatchObject({
      loading: false,
      content: 'loaded',
      savedContent: 'loaded',
    });
  });

  it('ignores pending open resolution after its loading tab is closed', async () => {
    let resolveRead!: (payload: { path: string; name: string; content: string }) => void;
    invokeMock.mockReturnValueOnce(new Promise((resolve) => { resolveRead = resolve; }));
    const store = useEditorStore();

    const openPromise = store.openFile('C:/project/slow.txt');
    store.closeFile('C:/project/slow.txt');
    resolveRead({ path: 'C:/project/slow.txt', name: 'slow.txt', content: 'loaded' });
    const opened = await openPromise;

    expect(opened).toBeNull();
    expect(store.files).toHaveLength(0);
    expect(store.activePath).toBeNull();
  });

  it('ignores pending open rejection after its loading tab is closed without deleting another tab', async () => {
    let rejectRead!: (error: Error) => void;
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/project/keep.txt', name: 'keep.txt', content: 'keep' })
      .mockReturnValueOnce(new Promise((_, reject) => { rejectRead = reject; }));
    const store = useEditorStore();

    await store.openFile('C:/project/keep.txt');
    const openPromise = store.openFile('C:/project/slow.txt');
    store.closeFile('C:/project/slow.txt');
    rejectRead(new Error('read failed'));
    const opened = await openPromise;

    expect(opened).toBeNull();
    expect(store.files.map((file) => file.path)).toEqual(['C:/project/keep.txt']);
    expect(store.activePath).toBe('C:/project/keep.txt');
  });

  it('opening the same file twice activates existing tab without duplicate or second read', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/a.txt',
      name: 'a.txt',
      content: 'first',
    });
    const store = useEditorStore();

    await store.openFile('C:/project/a.txt');
    store.updateActiveContent('unsaved edit');
    store.setActiveFile(null);
    await store.openFile('C:/project/a.txt');

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(store.files).toHaveLength(1);
    expect(store.activePath).toBe('C:/project/a.txt');
    expect(store.files[0].content).toBe('unsaved edit');
    expect(store.files[0].savedContent).toBe('first');
    expect(store.isDirty('C:/project/a.txt')).toBe(true);
  });

  it('opening the same file concurrently reuses the in-flight read', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/a.txt',
      name: 'a.txt',
      content: 'first',
    });
    const store = useEditorStore();

    await Promise.all([
      store.openFile('C:/project/a.txt'),
      store.openFile('C:/project/a.txt'),
    ]);

    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(store.files).toHaveLength(1);
    expect(store.activePath).toBe('C:/project/a.txt');
  });

  it('tracks dirty content and saves using write_text_file_cmd', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/a.txt',
      name: 'a.txt',
      content: 'old',
    });
    invokeMock.mockResolvedValueOnce(undefined);
    const store = useEditorStore();

    await store.openFile('C:/project/a.txt');
    store.updateActiveContent('new');

    expect(store.activeFile?.dirty).toBe(true);
    expect(store.dirtyFiles.map((file) => file.path)).toEqual(['C:/project/a.txt']);

    await store.saveActiveFile();

    expect(invokeMock).toHaveBeenLastCalledWith('write_text_file_cmd', {
      path: 'C:/project/a.txt',
      content: 'new',
    });
    expect(store.files[0].savedContent).toBe('new');
    expect(store.files[0].saving).toBe(false);
    expect(store.files[0].error).toBe('');
    expect(store.isDirty('C:/project/a.txt')).toBe(false);
  });

  it('keeps saved content and stores error when save fails', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/a.txt',
      name: 'a.txt',
      content: 'old',
    });
    invokeMock.mockRejectedValueOnce(new Error('write denied'));
    const store = useEditorStore();

    await store.openFile('C:/project/a.txt');
    store.updateActiveContent('new');
    const saved = await store.saveActiveFile();

    expect(saved).toBe(false);
    expect(store.files[0].savedContent).toBe('old');
    expect(store.files[0].content).toBe('new');
    expect(store.files[0].saving).toBe(false);
    expect(store.files[0].error).toBe('write denied');
  });

  it('closing dirty file cancel keeps open', async () => {
    invokeMock.mockResolvedValueOnce({
      path: 'C:/project/a.txt',
      name: 'a.txt',
      content: 'old',
    });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    const store = useEditorStore();

    await store.openFile('C:/project/a.txt');
    store.updateActiveContent('new');

    const closed = store.closeFile('C:/project/a.txt');

    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(closed).toBe(false);
    expect(store.files).toHaveLength(1);
    expect(store.activePath).toBe('C:/project/a.txt');
  });

  it('closing dirty file confirm closes and activates neighbor', async () => {
    invokeMock
      .mockResolvedValueOnce({ path: 'C:/project/a.txt', name: 'a.txt', content: 'a' })
      .mockResolvedValueOnce({ path: 'C:/project/b.txt', name: 'b.txt', content: 'b' })
      .mockResolvedValueOnce({ path: 'C:/project/c.txt', name: 'c.txt', content: 'c' });
    vi.spyOn(window, 'confirm').mockReturnValueOnce(true);
    const store = useEditorStore();

    await store.openFile('C:/project/a.txt');
    await store.openFile('C:/project/b.txt');
    await store.openFile('C:/project/c.txt');
    store.setActiveFile('C:/project/b.txt');
    store.updateActiveContent('dirty b');

    const closed = store.closeFile('C:/project/b.txt');

    expect(closed).toBe(true);
    expect(store.files.map((file) => file.path)).toEqual(['C:/project/a.txt', 'C:/project/c.txt']);
    expect(store.activePath).toBe('C:/project/c.txt');
  });

  it('open errors set openError and do not add a file', async () => {
    invokeMock.mockRejectedValueOnce(new Error('file is not valid UTF-8'));
    const store = useEditorStore();

    await store.openFile('C:/project/binary.bin');

    expect(store.files).toHaveLength(0);
    expect(store.activePath).toBeNull();
    expect(store.openError).toBe('file is not valid UTF-8');
  });
});
