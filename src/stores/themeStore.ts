import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { allThemes } from '../themes';
import type { AppTheme } from '../themes';

export type { AppTheme } from '../themes';

const THEME_KEY = 'lumiterm_theme';
const GLASS_KEY = 'lumiterm_glass_effect';
const GLASS_OPACITY_KEY = 'lumiterm_glass_opacity';

export const useThemeStore = defineStore('theme', () => {
  const themes: AppTheme[] = allThemes;
  const currentName = ref(themes[0].name);
  const glassEffectEnabled = ref(false);
  // 0 = fully opaque, 100 = fully transparent; default 20 (80% opaque)
  const glassOpacity = ref(20);

  function getCurrentTheme(): AppTheme {
    return themes.find((t) => t.name === currentName.value) ?? themes[0];
  }

  function setTheme(name: string) {
    if (themes.some((t) => t.name === name)) {
      currentName.value = name;
    }
  }

  function getAllThemes(): AppTheme[] {
    return themes;
  }

  function toggleGlassEffect() {
    glassEffectEnabled.value = !glassEffectEnabled.value;
  }

  watch(currentName, (name) => {
    try { localStorage.setItem(THEME_KEY, name); } catch { /* ignore */ }
  });

  watch(glassEffectEnabled, (enabled) => {
    try { localStorage.setItem(GLASS_KEY, String(enabled)); } catch { /* ignore */ }
  });

  watch(glassOpacity, (v) => {
    try { localStorage.setItem(GLASS_OPACITY_KEY, String(v)); } catch { /* ignore */ }
  });

  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && themes.some((t) => t.name === saved)) {
      currentName.value = saved;
    }
  } catch { /* ignore */ }

  try {
    const saved = localStorage.getItem(GLASS_KEY);
    if (saved !== null) glassEffectEnabled.value = saved === 'true';
  } catch { /* ignore */ }

  try {
    const saved = localStorage.getItem(GLASS_OPACITY_KEY);
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (!isNaN(n) && n >= 0 && n <= 100) glassOpacity.value = n;
    }
  } catch { /* ignore */ }

  return {
    currentName,
    glassEffectEnabled,
    glassOpacity,
    getCurrentTheme,
    setTheme,
    getAllThemes,
    toggleGlassEffect,
  };
});
