import React from 'react';
import { View, ViewProps, StyleProp, ViewStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

interface AppCardProps extends ViewProps {
  style?: StyleProp<ViewStyle>;
}

export const AppCard: React.FC<AppCardProps> = ({
  style,
  children,
  ...rest
}) => {
  const { colors, spacing, radius, shadow } = useTheme();

  return (
    <View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: radius.md,
          padding: spacing.lg,
          borderWidth: 1,
          borderColor: colors.borderSubtle,
        },
        shadow.card,
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};
