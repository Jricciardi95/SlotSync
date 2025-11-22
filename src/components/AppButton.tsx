// src/components/AppButton.tsx
import React from 'react';
import {
  TouchableOpacity,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
  Text,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';

type Variant = 'primary' | 'secondary' | 'ghost';

interface AppButtonProps {
  title: string;
  onPress?: (event: GestureResponderEvent) => void;
  variant?: Variant;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export const AppButton: React.FC<AppButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  style,
  disabled = false,
}) => {
  const { colors, spacing, radius, typography } = useTheme();

  const backgroundByVariant: Record<Variant, string> = {
    primary: colors.accent,
    secondary: colors.surface,
    ghost: 'transparent',
  };

  const textColorByVariant: Record<Variant, string> = {
    primary: colors.background,
    secondary: colors.textPrimary,
    ghost: colors.textPrimary,
  };

  return (
    <TouchableOpacity
      activeOpacity={0.88}
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: disabled
            ? colors.backgroundMuted
            : backgroundByVariant[variant],
          borderRadius: radius.lg,
          paddingVertical: spacing.sm + 2,
          paddingHorizontal: spacing.xl,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor:
            variant === 'ghost' ? colors.borderSubtle : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
        },
        style,
      ]}
    >
      <Text
        style={[
          typography.body,
          {
            textAlign: 'center',
            fontWeight: '600',
            letterSpacing: 0.4,
            color: textColorByVariant[variant],
          },
        ]}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );
};
