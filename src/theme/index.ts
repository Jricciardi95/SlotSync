import { DarkTheme as NavigationDarkTheme, Theme } from '@react-navigation/native';
import { colors } from './colors';
import { typography } from './typography';
import { spacing, radius, shadow } from './layout';

// Static theme object used app-wide
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
