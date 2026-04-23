import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

const STORAGE_KEY = 'lumiterm_font';

export const FONT_OPTIONS = [
  'Cascadia Code',
  'JetBrains Mono',
  'Fira Code',
  'Consolas',
  'SF Mono',
  'Source Code Pro',
] as const;

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as { fontFamily: string; fontSize: number; lineHeight: number };
  } catch { /* */ }
  return { fontFamily: 'Cascadia Code', fontSize: 13, lineHeight: 1.2 };
}

export const useFontStore = defineStore('font', () => {
  const saved = load();
  const fontFamily = ref(saved.fontFamily);
  const fontSize = ref(saved.fontSize);
  const lineHeight = ref(saved.lineHeight);

  watch([fontFamily, fontSize, lineHeight], () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fontFamily: fontFamily.value,
        fontSize: fontSize.value,
        lineHeight: lineHeight.value,
      }));
    } catch { /* */ }
  });

  return { fontFamily, fontSize, lineHeight, FONT_OPTIONS };
});
