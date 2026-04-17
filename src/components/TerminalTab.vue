<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { initTerminal, type TerminalInstance } from '../utils/xtermInitializer';
import { useTerminalStore, type ShellType } from '../stores/terminalStore';

const props = defineProps<{ tabId: string; shellType: ShellType; active: boolean }>();
const store = useTerminalStore();

const terminalRef = ref<HTMLElement | null>(null);
let instance: TerminalInstance | null = null;
let resizeObserver: ResizeObserver | null = null;
let sessionId: string | null = null;
let isMounted = true;

const shellCommands: Record<ShellType, string> = {
  powershell: 'powershell.exe',
  cmd: 'cmd.exe',
  wsl2: 'wsl.exe',
};

async function init(container: HTMLElement) {
  instance = initTerminal(container);
  const { terminal, fitAddon } = instance;

  const channel = new Channel<number[]>();
  channel.onmessage = (data) => terminal.write(new Uint8Array(data));

  try {
    sessionId = await invoke<string>('create_pty', {
      shell: shellCommands[props.shellType],
      cols: terminal.cols,
      rows: terminal.rows,
      channel,
    });
    store.setSessionId(props.tabId, sessionId);
  } catch (e) {
    terminal.write(`\r\nFailed to start shell: ${e}\r\n`);
    return;
  }

  terminal.attachCustomKeyEventHandler((e) => {
    if (e.ctrlKey && (e.key === 'w' || e.key === 't' || e.key === 'Tab')) {
      return false; // let window keydown handler take it
    }
    return true;
  });

  terminal.onData((data) => {
    if (!sessionId) return;
    invoke('write_pty_cmd', {
      sessionId: sessionId,
      data: Array.from(new TextEncoder().encode(data)),
    }).catch(() => {});
  });

  resizeObserver = new ResizeObserver(() => {
    if (!isMounted) return;
    fitAddon.fit();
    if (sessionId) {
      invoke('resize_pty_cmd', {
        sessionId: sessionId,
        cols: terminal.cols,
        rows: terminal.rows,
      }).catch(() => {});
    }
  });
  resizeObserver.observe(container);
}

watch(
  () => props.active,
  (active) => {
    if (active && instance) {
      // Wait for DOM layout to stabilize before fitting
      setTimeout(() => instance!.fitAddon.fit(), 50);
    }
  }
);

onMounted(() => {
  if (terminalRef.value) init(terminalRef.value);
});

onUnmounted(() => {
  isMounted = false;
  resizeObserver?.disconnect();
  if (sessionId) {
    invoke('close_pty_cmd', { sessionId }).catch(() => {});
  }
  instance?.dispose();
});
</script>

<template>
  <div
    ref="terminalRef"
    class="terminal-container"
    :style="{ display: active ? 'block' : 'none' }"
  />
</template>

<style scoped>
.terminal-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: #1e1e2e;
}
</style>
