import { defineStore } from 'pinia';
import { ref, watch } from 'vue';
import { allThemes } from '../themes';
import type { AppTheme } from '../themes';

export type { AppTheme } from '../themes';

const THEME_KEY = 'lumiterm_theme';
const GLASS_KEY = 'lumiterm_glass_effect';

export const useThemeStore = defineStore('theme', () => {
  const themes: AppTheme[] = allThemes;
  const currentName = ref(themes[0].name);
  const glassEffectEnabled = ref(false);

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

  return {
    currentName,
    glassEffectEnabled,
    getCurrentTheme,
    setTheme,
    getAllThemes,
    toggleGlassEffect,
  };
});
