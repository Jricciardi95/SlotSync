import React from 'react';
import {
  TouchableOpacity,
  GestureResponderEvent,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface AppIconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress?: (event: GestureResponderEvent) => void;
  style?: StyleProp<ViewStyle>;
  size?: number;
  active?: boolean;
}

export const AppIconButton: React.FC<AppIconButtonProps> = ({
  name,
  onPress,
  style,
  size = 20,
  active = false,
}) => {
  const { colors, spacing, radius } = useTheme();

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      style={[
        {
          backgroundColor: active ? colors.accent : colors.surface,
          borderRadius: radius.pill,
          padding: spacing.sm,
          justifyContent: 'center',
          alignItems: 'center',
          borderWidth: active ? 0 : 1,
          borderColor: colors.borderSubtle,
        },
        style,
      ]}
    >
      <Ionicons
        name={name}
        size={size}
        color={active ? colors.background : colors.textPrimary}
      />
    </TouchableOpacity>
  );
};
