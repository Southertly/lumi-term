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

  it('parses OSC 133;C;command and includes command text', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]133;C;echo hello\x1b\\');
    expect(result.events[0].type).toBe('exec_start');
    expect(result.events[0].command).toBe('echo hello');
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

  it('handles BEL-terminated OSC sequences (used by claude and many programs)', () => {
    const parser = new OscParser();
    // \x1b]0;title\x07 is a BEL-terminated window title sequence
    const result = parser.feed('\x1b]0;claude\x07\x1b[?25l');
    expect(result.cleanData).toBe('\x1b[?25l');
    expect(result.events).toHaveLength(0); // OSC 0 is not 133, so no event
  });

  it('does not buffer subsequent data after BEL-terminated OSC', () => {
    const parser = new OscParser();
    // Simulate what claude sends: title OSC then TUI content
    const result = parser.feed('\x1b]0;✳ Claude Code\x07\x1b[38;2;215;119;87m ▐');
    expect(result.cleanData).toBe('\x1b[38;2;215;119;87m ▐');
  });

  it('prefers earlier terminator when both BEL and ST appear', () => {
    const parser = new OscParser();
    // BEL comes before ST — should use BEL
    const result = parser.feed('\x1b]133;A\x07after');
    expect(result.cleanData).toBe('after');
    expect(result.events[0].type).toBe('prompt_start');
  });

  it('handles mixed BEL and ST terminated sequences in one chunk', () => {
    const parser = new OscParser();
    const result = parser.feed('\x1b]0;title\x07text\x1b]133;A\x1b\\more');
    expect(result.cleanData).toBe('textmore');
    expect(result.events).toHaveLength(1);
    expect(result.events[0].type).toBe('prompt_start');
  });
});
