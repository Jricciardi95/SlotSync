import React, { useCallback, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, FlatList } from 'react-native';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { getRecordsByTrackTitle } from '../data/repository';
import { RecordModel } from '../data/types';

type Props = NativeStackScreenProps<LibraryStackParamList, 'SongDetail'>;

export const SongDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { trackTitle } = route.params;
  const { colors, spacing, radius } = useTheme();
  const [records, setRecords] = useState<RecordModel[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    try {
      const recordsList = await getRecordsByTrackTitle(trackTitle);
      setRecords(recordsList);
    } finally {
      setLoading(false);
    }
  }, [trackTitle]);

  useFocusEffect(
    useCallback(() => {
      // Only reload if we're actually focused (not just coming back from navigation)
      // This prevents the "No albums found" issue when navigating back
      const timeoutId = setTimeout(() => {
        loadRecords();
      }, 100);
      
      return () => clearTimeout(timeoutId);
    }, [loadRecords])
  );

  if (loading) {
    return (
      <AppScreen title={trackTitle}>
        <View style={styles.headerActions}>
          <AppIconButton name="arrow-back" onPress={() => navigation.goBack()} />
        </View>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title={trackTitle} subtitle={`Albums containing this song`} scroll={false}>
      <View style={styles.headerActions}>
        <AppIconButton name="arrow-back" onPress={() => navigation.goBack()} />
      </View>
      <FlatList
        data={records}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <AppCard
            style={{
              marginBottom: spacing.md,
              backgroundColor: colors.surfaceAlt,
            }}
          >
            <AppText variant="subtitle">{item.artist}</AppText>
            <AppText variant="body" style={{ marginTop: 4 }}>
              {item.title}
            </AppText>
            {item.year && (
              <AppText variant="caption" style={{ marginTop: 4 }}>
                {item.year}
              </AppText>
            )}
            <View style={{ marginTop: spacing.sm }}>
              <AppText
                variant="caption"
                style={{ color: colors.accent }}
                onPress={() => {
                  // Get returnToTab from route params (passed from LibraryScreen when navigating to SongDetail)
                  // If not available, default to 'SONGS' as fallback
                  const returnToTab = (route.params as any)?.returnToTab || 'SONGS';
                  console.log('[SongDetail] Navigating to RecordDetail, returnToTab:', returnToTab);
                  navigation.navigate('RecordDetail', { 
                    recordId: item.id,
                    returnToTab: returnToTab, // Use the tab we came from (SONGS or ALL)
                  });
                }}
              >
                View Album →
              </AppText>
            </View>
          </AppCard>
        )}
        ListEmptyComponent={
          <AppCard>
            <AppText variant="body">No albums found containing this song.</AppText>
          </AppCard>
        }
        contentContainerStyle={{ paddingBottom: 20 }}
        style={{ flex: 1 }}
      />
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 48,
  },
  headerActions: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
  },
});

