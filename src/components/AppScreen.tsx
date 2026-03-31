import React from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../hooks/useTheme';
import { AppTheme } from '../theme';
import { AppText } from './AppText';

interface AppScreenProps {
  title?: string;
  subtitle?: string;
  scroll?: boolean;
  children: React.ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}

export const AppScreen: React.FC<AppScreenProps> = ({
  title,
  subtitle,
  scroll = true,
  children,
  contentStyle,
}) => {
  const { colors, spacing } = useTheme();
  const styles = createStyles(spacing);

  const Header = () =>
    title ? (
      <View style={[styles.header, { marginBottom: spacing.md }]}>
        <AppText variant="title" style={styles.titleText}>{title}</AppText>
        {subtitle && (
          <AppText variant="caption" style={styles.subtitle}>
            {subtitle}
          </AppText>
        )}
      </View>
    ) : null;

  const content = (
    <View style={styles.inner}>
      <Header />
      {children}
    </View>
  );

  return (
    <View
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <StatusBar style="light" />
      {scroll ? (
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl + 85 },
            contentStyle,
          ]}
          showsVerticalScrollIndicator={false}
        >
          {content}
        </ScrollView>
      ) : (
        <View
          style={[
            styles.content,
            { paddingHorizontal: spacing.lg, paddingBottom: 85 },
            contentStyle,
          ]}
        >
          {content}
        </View>
      )}
    </View>
  );
};

// Styles are defined inline with theme values to ensure spacing is always available
// This avoids StyleSheet.create issues with dynamic theme values
const createStyles = (spacing: AppTheme['spacing']) => StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    width: '100%',
    alignItems: 'center',
  },
  titleText: {
    textAlign: 'center',
  },
  subtitle: {
    marginTop: spacing.xs, // Use theme spacing instead of hardcoded 4
    textAlign: 'center',
  },
  content: {
    flexGrow: 1,
    paddingTop: spacing.xxl + spacing.lg, // 32 + 16 = 48, using theme values
  },
  inner: {
    flex: 1,
    gap: spacing.lg, // Use theme spacing instead of hardcoded 16
  },
});
