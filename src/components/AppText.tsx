// src/components/AppText.tsx
import React from 'react';
import { Text, TextProps, TextStyle } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export type TextVariant = 'title' | 'subtitle' | 'body' | 'caption';

interface AppTextProps extends TextProps {
  variant?: TextVariant;
  style?: TextStyle | TextStyle[];
}

export const AppText: React.FC<AppTextProps> = ({
  variant = 'body',
  style,
  children,
  ...rest
}) => {
  const { typography } = useTheme();

  const baseStyle = typography[variant];

  return (
    <Text style={[baseStyle, style]} {...rest}>
      {children}
    </Text>
  );
};
