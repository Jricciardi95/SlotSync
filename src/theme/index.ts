import { DarkTheme as NavigationDarkTheme, Theme } from '@react-navigation/native';
import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius, shadow } from './layout';

/**
 * Main theme object
 * 
 * All theme values are exported from a single source of truth.
 * Components should import from this file via useTheme() hook.
 */
export const theme = {
  colors,
  typography,
  spacing,
  radius,
  shadow,
};

export type AppTheme = typeof theme;

// React Navigation theme object
export const navTheme: Theme = {
  ...NavigationDarkTheme,
  colors: {
    ...NavigationDarkTheme.colors,
    primary: colors.accent,
    background: colors.background,
    card: colors.backgroundMuted,
    text: colors.textPrimary,
    border: colors.borderSubtle,
    notification: colors.accent,
  },
};
