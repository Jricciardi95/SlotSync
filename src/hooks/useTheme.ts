// src/hooks/useTheme.ts
import { theme, type AppTheme } from '../theme';

/**
 * Hook that returns the app theme
 * 
 * All components should use this hook to access theme values.
 * This ensures consistent spacing, colors, typography, etc.
 * 
 * @returns AppTheme object with colors, spacing, typography, radius, shadow
 */
export const useTheme = (): AppTheme => {
  // Theme is a static object, so we can return it directly
  // No need for defensive checks - spacing is always defined in layout.ts
  return theme;
};
