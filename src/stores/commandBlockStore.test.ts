import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCommandBlockStore } from './commandBlockStore';

describe('commandBlockStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('starts with no blocks for a new pane', () => {
    const store = useCommandBlockStore();
    expect(store.getBlocks('pane-1')).toEqual([]);
  });

  it('startBlock creates a running block', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'ls -la');
    const blocks = store.getBlocks('pane-1');
    expect(blocks).toHaveLength(1);
    expect(blocks[0].command).toBe('ls -la');
    expect(blocks[0].status).toBe('running');
    expect(blocks[0].output).toBe('');
  });

  it('appendOutput adds to the active block', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'echo hi');
    store.appendOutput('pane-1', 'hi\r\n');
    const blocks = store.getBlocks('pane-1');
    expect(blocks[0].output).toBe('hi\r\n');
  });

  it('endBlock sets status to success when exitCode is 0', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'echo hi');
    store.endBlock('pane-1', 0);
    const blocks = store.getBlocks('pane-1');
    expect(blocks[0].status).toBe('success');
    expect(blocks[0].exitCode).toBe(0);
    expect(blocks[0].endTime).toBeDefined();
  });

  it('endBlock sets status to error when exitCode is non-zero', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'bad-cmd');
    store.endBlock('pane-1', 1);
    expect(store.getBlocks('pane-1')[0].status).toBe('error');
  });

  it('blocks are isolated per pane', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'cmd-a');
    store.startBlock('pane-2', 'cmd-b');
    expect(store.getBlocks('pane-1')).toHaveLength(1);
    expect(store.getBlocks('pane-2')).toHaveLength(1);
    expect(store.getBlocks('pane-1')[0].command).toBe('cmd-a');
  });

  it('clearBlocks removes all blocks for a pane', () => {
    const store = useCommandBlockStore();
    store.startBlock('pane-1', 'cmd');
    store.clearBlocks('pane-1');
    expect(store.getBlocks('pane-1')).toHaveLength(0);
  });
});
