import { describe, expect, it } from 'vitest';
import { hexToRgbString } from './colorUtils';

describe('hexToRgbString', () => {
  it('parses 6-digit hex', () => {
    expect(hexToRgbString('#282a36')).toBe('40, 42, 54');
  });

  it('parses 3-digit hex by expanding to 6', () => {
    expect(hexToRgbString('#abc')).toBe('170, 187, 204');
  });

  it('is case-insensitive', () => {
    expect(hexToRgbString('#FFFFFF')).toBe('255, 255, 255');
    expect(hexToRgbString('#ffffff')).toBe('255, 255, 255');
  });

  it('falls back to mid grey for invalid input', () => {
    expect(hexToRgbString('not-a-color')).toBe('128, 128, 128');
    expect(hexToRgbString('')).toBe('128, 128, 128');
  });
});
