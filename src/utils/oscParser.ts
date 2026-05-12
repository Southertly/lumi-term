export type OscEventType = 'prompt_start' | 'command_start' | 'exec_start' | 'exec_end';

export interface OscEvent {
  type: OscEventType;
  exitCode?: number;
  command?: string;
  timestamp: number;
}

export interface ParseResult {
  cleanData: string;
  events: OscEvent[];
}

const OSC_START = '\x1b]';
const OSC_END_ST = '\x1b\\'; // String Terminator
const OSC_END_BEL = '\x07';  // BEL — also a valid OSC terminator (used by many programs)

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

      const stPos = input.indexOf(OSC_END_ST, oscStart + 2);
      const belPos = input.indexOf(OSC_END_BEL, oscStart + 2);

      let oscEnd: number;
      let termLen: number;

      if (stPos === -1 && belPos === -1) {
        // Incomplete sequence — buffer remainder
        this.buffer = input.slice(oscStart);
        break;
      } else if (stPos === -1 || (belPos !== -1 && belPos < stPos)) {
        oscEnd = belPos;
        termLen = OSC_END_BEL.length;
      } else {
        oscEnd = stPos;
        termLen = OSC_END_ST.length;
      }

      const payload = input.slice(oscStart + 2, oscEnd);
      const event = parseOscPayload(payload);
      if (event) events.push(event);

      i = oscEnd + termLen;
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
  if (code.startsWith('C;')) return { type: 'exec_start', command: code.slice(2), timestamp };
  if (code.startsWith('D')) {
    const exitCode = parseInt(code.slice(2), 10);
    return { type: 'exec_end', exitCode: isNaN(exitCode) ? 0 : exitCode, timestamp };
  }
  return null;
}
