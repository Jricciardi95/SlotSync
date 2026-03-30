/**
 * PR4: Optimized Record Row Component
 * 
 * Memoized row component for library list rendering.
 * Extracted from LibraryScreen for better performance.
 */

import React, { memo, useCallback } from 'react';
import { TouchableOpacity, View, StyleSheet, Image } from 'react-native';
import { AppText } from './AppText';
import { useTheme } from '../hooks/useTheme';
import { RecordModel } from '../data/types';
import { Ionicons } from '@expo/vector-icons';

type RecordRowProps = {
  item: RecordModel;
  isPlaced: boolean;
  onPress: (recordId: string) => void;
  onOptionsPress: (recordId: string) => void;
};

// PR4: Memoized row component to prevent unnecessary re-renders
export const RecordRow = memo<RecordRowProps>(({ item, isPlaced, onPress, onOptionsPress }) => {
  const { colors, spacing, radius } = useTheme();
  
  const handlePress = useCallback(() => {
    onPress(item.id);
  }, [item.id, onPress]);
  
  const handleOptionsPress = useCallback((e: any) => {
    e.stopPropagation();
    onOptionsPress(item.id);
  }, [item.id, onOptionsPress]);
  
  // PR4: Use cached image component (getCoverImageUri handles caching)
  const { getCoverImageUri } = require('../utils/imageSelection');
  const imageUri = getCoverImageUri(item.coverImageRemoteUrl, item.coverImageLocalUri);
  
  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.9}
      style={[
        styles.recordCard,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.borderSubtle,
          borderRadius: radius.md,
          marginBottom: spacing.md,
        },
      ]}
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={styles.coverArt}
          // PR4: Image optimization props
          resizeMode="cover"
          // Note: expo-image would be better but requires migration
          // For now, React Native Image with these props is acceptable
        />
      ) : (
        <View
          style={[
            styles.coverPlaceholder,
            { backgroundColor: colors.backgroundMuted },
          ]}
        >
          <AppText variant="caption">No cover</AppText>
        </View>
      )}
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <AppText variant="subtitle">{item.title}</AppText>
        <AppText variant="body" style={{ marginTop: 4, color: colors.textSecondary }}>
          {item.artist}
        </AppText>
        <AppText
          variant="caption"
          style={{
            marginTop: 8,
            color: isPlaced ? colors.accent : colors.textMuted,
          }}
        >
          {isPlaced ? 'Placed' : 'Not placed yet'}
        </AppText>
      </View>
      <TouchableOpacity
        onPress={handleOptionsPress}
        style={{ padding: spacing.sm }}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}, (prevProps, nextProps) => {
  // PR4: Custom comparison function for React.memo
  // Only re-render if these props change
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.title === nextProps.item.title &&
    prevProps.item.artist === nextProps.item.artist &&
    prevProps.item.coverImageRemoteUrl === nextProps.item.coverImageRemoteUrl &&
    prevProps.item.coverImageLocalUri === nextProps.item.coverImageLocalUri &&
    prevProps.isPlaced === nextProps.isPlaced
  );
});

RecordRow.displayName = 'RecordRow';

const styles = StyleSheet.create({
  recordCard: {
    flexDirection: 'row',
    padding: 12,
    alignItems: 'center',
  },
  coverArt: {
    width: 60,
    height: 60,
    borderRadius: 4,
  },
  coverPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
});


