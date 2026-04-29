import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../hooks/useTheme';
import { getStoredShelfBaseUrl } from '../services/shelfApi/storage';
import {
  getShelfConnectionSnapshot,
  subscribeShelfConnection,
} from '../services/shelfApi/connectionState';
import { formatShelfFailureForUser } from '../services/shelfApi/shelfUserMessages';
import { useNavigation } from '../navigation/hooks';

/**
 * Shown when a shelf base URL is saved but the last shelf HTTP call failed.
 * Tap opens Settings (Smart shelf lives there).
 */
export const ShelfOfflineBanner: React.FC = () => {
  const { colors, spacing } = useTheme();
  const nav = useNavigation();
  const [configured, setConfigured] = useState(false);
  const [, tick] = useState(0);

  useEffect(() => {
    void getStoredShelfBaseUrl().then((u) => setConfigured(Boolean(u?.trim())));
  }, []);

  useEffect(() => subscribeShelfConnection(() => tick((n) => n + 1)), []);

  const { lastError } = getShelfConnectionSnapshot();
  if (!configured || !lastError) {
    return null;
  }

  return (
    <TouchableOpacity
      onPress={() => nav.navigate('Settings')}
      activeOpacity={0.85}
      style={[
        styles.bar,
        { backgroundColor: colors.surfaceAlt, borderBottomColor: colors.borderSubtle },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Shelf connection issue. Open settings."
    >
      <View style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.sm }}>
        <AppText variant="caption" style={{ color: colors.error, fontWeight: '600' }}>
          Smart shelf unreachable
        </AppText>
        <AppText variant="caption" style={{ color: colors.textSecondary, marginTop: 2 }}>
          {formatShelfFailureForUser(lastError)} Tap to open Settings → Shelf connection.
        </AppText>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
