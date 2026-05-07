import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface CommandBlock {
  id: string;
  command: string;
  output: string;
  status: 'running' | 'success' | 'error';
  exitCode?: number;
  startTime: number;
  endTime?: number;
}

export const useCommandBlockStore = defineStore('commandBlocks', () => {
  // Map from paneId → blocks
  const paneBlocks = ref<Map<string, CommandBlock[]>>(new Map());

  function getBlocks(paneId: string): CommandBlock[] {
    return paneBlocks.value.get(paneId) ?? [];
  }

  function startBlock(paneId: string, command: string) {
    const blocks = paneBlocks.value.get(paneId) ?? [];
    blocks.push({
      id: crypto.randomUUID(),
      command,
      output: '',
      status: 'running',
      startTime: Date.now(),
    });
    paneBlocks.value.set(paneId, blocks);
  }

  function appendOutput(paneId: string, data: string) {
    const blocks = paneBlocks.value.get(paneId);
    if (!blocks) return;
    const active = blocks.findLast((b) => b.status === 'running');
    if (active) active.output += data;
  }

  function endBlock(paneId: string, exitCode: number) {
    const blocks = paneBlocks.value.get(paneId);
    if (!blocks) return;
    const active = blocks.findLast((b) => b.status === 'running');
    if (!active) return;
    active.exitCode = exitCode;
    active.status = exitCode === 0 ? 'success' : 'error';
    active.endTime = Date.now();
  }

  function clearBlocks(paneId: string) {
    paneBlocks.value.set(paneId, []);
  }

  return { getBlocks, startBlock, appendOutput, endBlock, clearBlocks };
});
