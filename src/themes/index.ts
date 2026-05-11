import { builtinThemes } from './builtin';
import { warpImportedThemes } from './warp-imported';

export type { AppTheme, AppThemeUi, TerminalTheme } from './types';

export const allThemes = [
  ...builtinThemes,
  ...warpImportedThemes,
];
