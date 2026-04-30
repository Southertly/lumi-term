import { afterEach, vi } from 'vitest';

afterEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

if (!globalThis.PointerEvent) {
  class PointerEventFallback extends MouseEvent {
    pointerId: number;
    pointerType: string;
    isPrimary: boolean;

    constructor(type: string, eventInitDict: PointerEventInit = {}) {
      super(type, eventInitDict);
      this.pointerId = eventInitDict.pointerId ?? 1;
      this.pointerType = eventInitDict.pointerType ?? 'mouse';
      this.isPrimary = eventInitDict.isPrimary ?? true;
    }
  }

  vi.stubGlobal('PointerEvent', PointerEventFallback);
}
