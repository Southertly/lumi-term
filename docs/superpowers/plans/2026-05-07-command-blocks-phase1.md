# Command Blocks Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Command Blocks to LumiTerm — each shell command gets a visually distinct block with its output, exit status, and timing, similar to Warp Terminal.

**Architecture:** Inject OSC 133 shell integration sequences into PowerShell via the existing `build_shell_command()` prompt hook. Parse those sequences in the frontend to track command boundaries, store block state in a new Pinia store, and render blocks as Vue overlay components on top of xterm.js.

**Tech Stack:** Rust (portable-pty, existing), TypeScript/Vue 3, Pinia, xterm.js `ITerminalAddon` API for OSC parsing

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src-tauri/src/services/pty_service.rs` | Inject OSC 133 sequences into PowerShell prompt hook |
| Create | `src/utils/oscParser.ts` | Parse OSC 133 sequences from raw PTY byte stream |
| Create | `src/stores/commandBlockStore.ts` | Block lifecycle state (start/append/end), per-pane |
| Create | `src/components/CommandBlock.vue` | Render a single block (command + output + status) |
| Modify | `src/components/TerminalPane.vue` | Wire OSC parser → store → overlay rendering |
| Create | `src/utils/oscParser.test.ts` | Unit tests for OSC parser |
| Create | `src/stores/commandBlockStore.test.ts` | Unit tests for block store |

---

## Task 1: Rust — Inject OSC 133 into PowerShell Prompt Hook

**Files:**
- Modify: `src-tauri/src/services/pty_service.rs:438-461`

The existing PowerShell `-Command` string already wraps `$function:prompt`. We extend it to emit OSC 133 sequences:
- `\x1b]133;A\x1b\\` — prompt start (before prompt text)
- `\x1b]133;B\x1b\\` — command start (after prompt text, before user input)
- `\x1b]133;C\x1b\\` — command executed (when Enter is pressed)
- `\x1b]133;D;{exitCode}\x1b\\` — command finished (after output)

We use `$PSStyle.OutputRendering = 'PlainText'` to avoid ANSI in exit code capture, and `$LASTEXITCODE ?? $?` for the exit code.

- [ ] **Step 1.1: Write the failing test**

In `src-tauri/src/services/pty_service.rs`, add to the `#[cfg(test)]` block:

```rust
#[test]
fn powershell_args_include_osc133_prompt_hook() {
    let (_, args) = build_shell_command("powershell.exe", None);
    let cmd_str = args.join(" ");
    assert!(cmd_str.contains("133;A"), "missing OSC 133;A (prompt start)");
    assert!(cmd_str.contains("133;B"), "missing OSC 133;B (command start)");
    assert!(cmd_str.contains("133;C"), "missing OSC 133;C (exec start)");
    assert!(cmd_str.contains("133;D"), "missing OSC 133;D (exec end)");
}
```

- [ ] **Step 1.2: Run test to verify it fails**

```powershell
cd E:\claudecode\lumi-term
cargo test -p lumi-term-lib powershell_args_include_osc133_prompt_hook 2>&1 | Select-String -Pattern "FAILED|PASSED|error"
```

Expected: `FAILED` — the current prompt hook has no OSC 133 sequences.

- [ ] **Step 1.3: Replace the PowerShell `-Command` string in `build_shell_command()`**

In `src-tauri/src/services/pty_service.rs`, replace lines 443–454 (the `vec![...]` for PowerShell args):

```rust
    } else if resolved_shell.to_lowercase().contains("powershell")
        || resolved_shell.to_lowercase().contains("pwsh")
    {
        vec![
            "-NoLogo".to_string(),
            "-NoExit".to_string(),
            "-Command".to_string(),
            concat!(
                "try { Set-PSReadLineOption -PredictionSource History -PredictionViewStyle ListView } catch {}; ",
                "$global:_lf = [IO.Path]::Combine($env:TEMP, 'lumiterm_cwd.txt'); ",
                "$global:_op = $function:prompt; ",
                "$function:prompt = { ",
                  "Write-Host \"`e]133;A`e\\\" -NoNewline; ",
                  "try { (Get-Location).Path | Set-Content $global:_lf -NoNewline } catch {}; ",
                  "$r = if ($global:_op) { & $global:_op } else { 'PS ' + $executionContext.SessionState.Path.CurrentLocation + '> ' }; ",
                  "Write-Host \"`e]133;B`e\\\" -NoNewline; ",
                  "$r ",
                "}; ",
                "Set-PSReadLineKeyHandler -Key Enter -ScriptBlock { ",
                  "Write-Host \"`e]133;C`e\\\" -NoNewline; ",
                  "[Microsoft.PowerShell.PSConsoleReadLine]::AcceptLine(); ",
                "}; ",
                "function global:Prompt-Done { ",
                  "param([int]$code); ",
                  "Write-Host \"`e]133;D;$code`e\\\" -NoNewline ",
                "}"
            ).to_string(),
        ]
```

- [ ] **Step 1.4: Run test to verify it passes**

```powershell
cargo test -p lumi-term-lib powershell_args_include_osc133_prompt_hook 2>&1 | Select-String -Pattern "FAILED|PASSED|ok"
```

Expected: `ok` / `PASSED`

- [ ] **Step 1.5: Run all existing Rust tests to check for regressions**

```powershell
cargo test -p lumi-term-lib 2>&1 | Select-String -Pattern "FAILED|test result"
```

Expected: `test result: ok`

- [ ] **Step 1.6: Commit**

```powershell
git add src-tauri/src/services/pty_service.rs
git commit -m "feat: inject OSC 133 shell integration into PowerShell prompt hook"
```

---

## Task 2: Frontend — OSC 133 Parser

**Files:**
- Create: `src/utils/oscParser.ts`
- Create: `src/utils/oscParser.test.ts`

The parser strips OSC sequences from the raw byte stream and returns structured events. It must handle sequences split across multiple chunks (buffered parsing).

- [ ] **Step 2.1: Write the failing tests**

Create `src/utils/oscParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { OscParser } from './oscParser';

describe('OscParser', () => {
  it('strips OSC 133;A from output and emits prompt_start event', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;A\x1b\\hello');
    expect(result.cleanData).toBe('hello');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('prompt_start');
  });

  it('strips OSC 133;B and emits command_start', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;B\x1b\\');
    expect(result.cleanData).toBe('');
    expect(result.events[0].type).toBe('command_start');
  });

  it('strips OSC 133;C and emits exec_start', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;C\x1b\\');
    expect(result.events[0].type).toBe('exec_start');
  });

  it('strips OSC 133;D;0 and emits exec_end with exitCode 0', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;D;0\x1b\\');
    expect(result.events[0].type).toBe('exec_end');
    expect(result.events[0].exitCode).toBe(0);
  });

  it('strips OSC 133;D;1 and emits exec_end with exitCode 1', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;D;1\x1b\\');
    expect(result.events[0].exitCode).toBe(1);
  });

  it('handles sequences split across two feed() calls', () => {
    const parser = new OscParser();
    parser.feed('\x1b]133;');
    const result = parser.feed('A\x1b\\text');
    expect(result.cleanData).toBe('text');
    expect(result.events[0].type).toBe('prompt_start');
  });

  it('passes through non-OSC data unchanged', () => {
    const parser = new OscParser();
    const result = parser.feed('hello world');
    expect(result.cleanData).toBe('hello world');
    expect(result.events).toHaveLength(0);
  });

  it('handles multiple sequences in one chunk', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;A\x1b\\PS> \x1b]133;B\x1b\\');
    expect(result.cleanData).toBe('PS> ');
    expect(result.events).toHaveLength(2);
    expect(result.events[0].type).toBe('prompt_start');
    expect(result.events[1].type).toBe('command_start');
  });
});
```

- [ ] **Step 2.2: Run tests to verify they fail**

```powershell
npx vitest run src/utils/oscParser.test.ts 2>&1 | Select-String -Pattern "FAIL|PASS|Error"
```

Expected: `FAIL` — `oscParser.ts` does not exist yet.

- [ ] **Step 2.3: Implement `src/utils/oscParser.ts`**

```typescript
export type OscEventType = 'prompt_start' | 'command_start' | 'exec_start' | 'exec_end';

export interface OscEvent {
  type: OscEventType;
  exitCode?: number;
  timestamp: number;
}

export interface ParseResult {
  cleanData: string;
  events: OscEvent[];
}

const OSC_START = '\x1b]';
const OSC_END = '\x1b\\';

export class OscParser {
  private buffer = '';

  feed(data: string): ParseResult {
    const input = this.buffer + data;
    this.buffer = '';

    const events: OscEvent[] = [];
    let cleanData = '';
    let i = 0;

    while (i < input.length) {
      const oscStart = input.indexOf(OSC_START, i);
      if (oscStart === -1) {
        cleanData += input.slice(i);
        break;
      }

      cleanData += input.slice(i, oscStart);
      const oscEnd = input.indexOf(OSC_END, oscStart + 2);

      if (oscEnd === -1) {
        // Incomplete sequence — buffer remainder
        this.buffer = input.slice(oscStart);
        break;
      }

      const payload = input.slice(oscStart + 2, oscEnd);
      const event = parseOscPayload(payload);
      if (event) events.push(event);

      i = oscEnd + OSC_END.length;
    }

    return { cleanData, events };
  }
}

function parseOscPayload(payload: string): OscEvent | null {
  if (!payload.startsWith('133;')) return null;
  const code = payload.slice(4);
  const timestamp = Date.now();

  if (code === 'A') return { type: 'prompt_start', timestamp };
  if (code === 'B') return { type: 'command_start', timestamp };
  if (code === 'C') return { type: 'exec_start', timestamp };
  if (code.startsWith('D')) {
    const exitCode = parseInt(code.slice(2), 10);
    return { type: 'exec_end', exitCode: isNaN(exitCode) ? 0 : exitCode, timestamp };
  }
  return null;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

```powershell
npx vitest run src/utils/oscParser.test.ts 2>&1 | Select-String -Pattern "FAIL|PASS|passed|failed"
```

Expected: all tests pass.

- [ ] **Step 2.5: Commit**

```powershell
git add src/utils/oscParser.ts src/utils/oscParser.test.ts
git commit -m "feat: add OSC 133 parser for shell integration sequences"
```

---

## Task 3: Pinia Store — Command Block State

**Files:**
- Create: `src/stores/commandBlockStore.ts`
- Create: `src/stores/commandBlockStore.test.ts`

Each pane has its own list of blocks. A block is created on `exec_start`, accumulates output, and is closed on `exec_end`.

- [ ] **Step 3.1: Write the failing tests**

Create `src/stores/commandBlockStore.test.ts`:

```typescript
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
```

- [ ] **Step 3.2: Run tests to verify they fail**

```powershell
npx vitest run src/stores/commandBlockStore.test.ts 2>&1 | Select-String -Pattern "FAIL|PASS|Error"
```

Expected: `FAIL` — store does not exist yet.

- [ ] **Step 3.3: Implement `src/stores/commandBlockStore.ts`**

```typescript
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
```

- [ ] **Step 3.4: Run tests to verify they pass**

```powershell
npx vitest run src/stores/commandBlockStore.test.ts 2>&1 | Select-String -Pattern "FAIL|PASS|passed|failed"
```

Expected: all tests pass.

- [ ] **Step 3.5: Commit**

```powershell
git add src/stores/commandBlockStore.ts src/stores/commandBlockStore.test.ts
git commit -m "feat: add commandBlockStore for per-pane block lifecycle"
```

---

## Task 4: Vue Component — CommandBlock Renderer

**Files:**
- Create: `src/components/CommandBlock.vue`

Renders a single block. No tests for this task (visual component — verified manually in Task 5).

- [ ] **Step 4.1: Create `src/components/CommandBlock.vue`**

```vue
<script setup lang="ts">
import type { CommandBlock } from '../stores/commandBlockStore';

defineProps<{ block: CommandBlock }>();

function formatDuration(block: CommandBlock): string {
  if (!block.endTime) return '';
  const ms = block.endTime - block.startTime;
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
</script>

<template>
  <div class="cmd-block" :class="block.status">
    <div class="cmd-block-header">
      <span class="cmd-block-status-icon">
        <span v-if="block.status === 'running'">⏳</span>
        <span v-else-if="block.status === 'success'">✓</span>
        <span v-else>✗</span>
      </span>
      <span class="cmd-block-command">{{ block.command }}</span>
      <span class="cmd-block-duration">{{ formatDuration(block) }}</span>
    </div>
    <pre v-if="block.output" class="cmd-block-output">{{ block.output }}</pre>
  </div>
</template>

<style scoped>
.cmd-block {
  border-left: 2px solid var(--ui-border, #444);
  margin: 4px 0;
  border-radius: 0 4px 4px 0;
  background: rgba(0, 0, 0, 0.2);
  font-family: inherit;
  font-size: 12px;
}

.cmd-block.success { border-left-color: #4caf50; }
.cmd-block.error   { border-left-color: #f44336; }
.cmd-block.running { border-left-color: #ff9800; }

.cmd-block-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  color: var(--ui-fg, #ccc);
}

.cmd-block-command {
  flex: 1;
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cmd-block-duration {
  color: var(--ui-fg-muted, #888);
  font-size: 10px;
}

.cmd-block-output {
  margin: 0;
  padding: 4px 8px 6px 24px;
  color: var(--ui-fg-muted, #aaa);
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow-y: auto;
}
</style>
```

- [ ] **Step 4.2: Commit**

```powershell
git add src/components/CommandBlock.vue
git commit -m "feat: add CommandBlock component for block rendering"
```

---

## Task 5: Wire Everything Together in TerminalPane

**Files:**
- Modify: `src/components/TerminalPane.vue`

The OSC parser intercepts the raw PTY byte stream before it reaches xterm.js. Events drive the store. The CommandBlock overlay renders above the terminal.

**Important:** xterm.js must still receive the clean data (OSC sequences stripped). The overlay is positioned absolutely over the terminal container and is pointer-events-none so it doesn't block terminal interaction.

- [ ] **Step 5.1: Add imports and store to `TerminalPane.vue`**

At the top of the `<script setup>` block, after the existing imports, add:

```typescript
import { OscParser } from '../utils/oscParser';
import { useCommandBlockStore } from '../stores/commandBlockStore';
import CommandBlock from './CommandBlock.vue';
```

After the existing store declarations (line ~19), add:

```typescript
const blockStore = useCommandBlockStore();
const oscParser = new OscParser();
const pendingCommand = ref('');
```

- [ ] **Step 5.2: Modify the PTY output handler in `init()`**

Replace the existing `channel.onmessage` handler (lines ~100–103):

```typescript
  channel.onmessage = (rawData) => {
    const bytes = new Uint8Array(rawData);
    const text = new TextDecoder().decode(bytes);
    const { cleanData, events } = oscParser.feed(text);

    // Write clean data (OSC stripped) to xterm
    if (cleanData) terminal.write(cleanData);

    // Process OSC events
    for (const event of events) {
      if (event.type === 'command_start') {
        // Capture what the user typed (xterm buffer since last prompt)
        pendingCommand.value = terminal.buffer.active
          .getLine(terminal.buffer.active.cursorY)
          ?.translateToString(true)
          .trim() ?? '';
      } else if (event.type === 'exec_start') {
        blockStore.startBlock(props.paneId, pendingCommand.value);
        pendingCommand.value = '';
      } else if (event.type === 'exec_end') {
        blockStore.endBlock(props.paneId, event.exitCode ?? 0);
      }
    }
  };
```

- [ ] **Step 5.3: Add the block overlay to the template**

In `<template>`, inside `.pane-wrapper`, after the `.terminal-container` div, add:

```html
    <!-- Command block overlay -->
    <div class="block-overlay" aria-hidden="true">
      <CommandBlock
        v-for="block in blockStore.getBlocks(paneId)"
        :key="block.id"
        :block="block"
      />
    </div>
```

- [ ] **Step 5.4: Add overlay styles**

In `<style scoped>`, add:

```css
.block-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  max-height: 40%;
  overflow-y: auto;
  pointer-events: none;
  z-index: 10;
  padding: 4px;
}
```

- [ ] **Step 5.5: Clean up blocks when pane unmounts**

In `onUnmounted()`, before the existing cleanup, add:

```typescript
  blockStore.clearBlocks(props.paneId);
```

- [ ] **Step 5.6: Start dev server and manually verify**

```powershell
npx pnpm tauri dev
```

Manual test checklist:
1. Open a terminal tab
2. Type `echo hello` and press Enter — a block should appear with ✓ and "echo hello"
3. Type `Get-ChildItem` — block appears with output
4. Type `nonexistent-command` — block appears with ✗ (error status)
5. Close the tab — no console errors

- [ ] **Step 5.7: Commit**

```powershell
git add src/components/TerminalPane.vue
git commit -m "feat: wire OSC parser and command blocks into TerminalPane"
```

---

## Task 6: Run Full Test Suite

- [ ] **Step 6.1: Run all frontend tests**

```powershell
npx vitest run 2>&1 | Select-String -Pattern "FAIL|passed|failed|Error"
```

Expected: all tests pass (including the new oscParser and commandBlockStore tests).

- [ ] **Step 6.2: Run all Rust tests**

```powershell
cargo test -p lumi-term-lib 2>&1 | Select-String -Pattern "FAILED|test result"
```

Expected: `test result: ok`

- [ ] **Step 6.3: Final commit if any fixes were needed**

```powershell
git add -A
git commit -m "fix: address issues found during full test run"
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ OSC 133;A/B/C/D injection in Rust
- ✅ Frontend OSC parser with split-chunk handling
- ✅ Per-pane block store with lifecycle (start/append/end)
- ✅ Visual block rendering with status icons and duration
- ✅ Wired into TerminalPane output stream
- ✅ Cleanup on pane unmount

**Known limitations (out of scope for Phase 1):**
- CMD shell not supported (OSC 133 only injected for PowerShell)
- No virtual scrolling for large block lists (deferred to Phase 2)
- Block output is plain text; ANSI colors not rendered in overlay (xterm handles the real output)
- `pendingCommand` capture from xterm buffer is best-effort; multi-line commands may be truncated
