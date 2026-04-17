# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LumiTerm is a high-performance Windows terminal built with Tauri + Vue 3 + xterm.js. Current phase: MVP (single-window PowerShell terminal).

## Architecture

```
Frontend (Vue 3 + xterm.js)
    ↓ (Tauri Channel API)
Rust Backend (Tauri)
    ├─ PTY Manager (portable-pty)
    ├─ Reader Thread (output streaming)
    ├─ Writer Thread (input handling)
    └─ Resize Handler
    ↓ (Windows ConPTY)
Shell (PowerShell / CMD / WSL2)
```

## Development Commands

```bash
# Install dependencies
npx pnpm install

# Run development mode
npx pnpm tauri dev

# Build for production
npx pnpm tauri build
```

## Key Technical Decisions

- **PTY Layer**: `portable-pty` crate for cross-platform ConPTY abstraction
- **IPC**: Tauri Channel API for streaming terminal output (high-throughput)
- **Rendering**: xterm.js with WebGL acceleration (fallback to Canvas)
- **UTF-8**: All shells forced to UTF-8, CMD uses `chcp 65001`

## Project Structure

- `src/` - Vue 3 frontend
  - `components/TerminalTab.vue` - Core terminal component
  - `utils/xtermInitializer.ts` - xterm.js initialization
  - `stores/terminalStore.ts` - Pinia state management
- `src-tauri/src/` - Rust backend
  - `services/pty_service.rs` - ConPTY wrapper, process lifecycle
  - `commands/pty.rs` - Tauri command layer
  - `lib.rs` - Application entry point

## Common Tasks

**Test terminal with Chinese characters:**
```powershell
echo 你好世界
```

**Check for zombie processes:**
```bash
# After closing terminal, verify PowerShell process exited
tasklist | findstr powershell
```

**Debug PTY issues:**
- Check `src-tauri/src/services/pty_service.rs` for reader/writer thread logic
- Verify UTF-8 encoding in shell spawn command
- Ensure separate threads for input/output to avoid deadlocks
