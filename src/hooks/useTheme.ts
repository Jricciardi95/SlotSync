// src/hooks/useTheme.ts
import { theme, type AppTheme } from '../theme';

// Hook that returns our static theme object.
// Later we can switch this to a real React context if we want live theming.
export const useTheme = (): AppTheme => {
  return theme;
};
