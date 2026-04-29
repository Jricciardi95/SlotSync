import { logger } from '../utils/logger';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { ModesStackParamList } from '../navigation/types';
import {
  getSessionRecordsByRecordIds,
  markSessionRecordsReturnedByRecordIds,
  getRecordById,
  getRecordLocationByRecord,
  getUnitById,
  updateSession,
} from '../data/repository';
import { RecordModel, RecordLocation } from '../data/types';
import { setSlotLight, clearSlotLight } from '../services/ShelfLightingClient';

type Props = NativeStackScreenProps<ModesStackParamList, 'CleanupModeFlow'>;

type CleanupItem = {
  record: RecordModel;
  location: RecordLocation | null;
  unitIpAddress: string | null;
};

export const CleanupModeFlowScreen: React.FC<Props> = ({ route, navigation }) => {
  const { sessionIds } = route.params;
  const { colors, spacing } = useTheme();
  const [items, setItems] = useState<CleanupItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lighting, setLighting] = useState(false);

  const currentItem = useMemo(() => items[currentIndex], [items, currentIndex]);

  useEffect(() => {
    const loadCleanupItems = async () => {
      setLoading(true);
      try {
        // Get all session records for these sessions
        const allSessionRecords = await getSessionRecordsByRecordIds(sessionIds);
        const recordIds = [...new Set(allSessionRecords.map((sr) => sr.recordId))];

        // Build cleanup items
        const cleanupItems: CleanupItem[] = [];
        for (const recordId of recordIds) {
          const [record, location] = await Promise.all([
            getRecordById(recordId),
            getRecordLocationByRecord(recordId),
          ]);

          if (!record) continue;

          let unitIpAddress: string | null = null;
          if (location) {
            const unit = await getUnitById(location.unitId);
            unitIpAddress = unit?.ipAddress || null;
          }

          cleanupItems.push({
            record,
            location,
            unitIpAddress,
          });
        }

        setItems(cleanupItems);
      } catch (error) {
        logger.error('Failed to load cleanup items', error);
        Alert.alert('Error', 'Could not load records for cleanup.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadCleanupItems();
  }, [sessionIds, navigation]);

  useEffect(() => {
    if (!currentItem || !currentItem.location || !currentItem.unitIpAddress) return;

    const lightSlots = async () => {
      setLighting(true);
      try {
        const slots = currentItem.location!.slotNumbers;
        await setSlotLight({
          ipAddress: currentItem.unitIpAddress!,
          slot: slots[0],
          allSlots: slots,
          color: '#3C4E63',
          brightness: 0.8,
          effect: 'slow_pulse',
        });
      } catch {
        // Error handled in client
      } finally {
        setLighting(false);
      }
    };

    lightSlots();

    return () => {
      if (currentItem?.location && currentItem?.unitIpAddress) {
        clearSlotLight({ ipAddress: currentItem.unitIpAddress!, slot: 1 }).catch(() => {});
      }
    };
  }, [currentItem]);

  const handleNext = async () => {
    if (!currentItem) return;

    try {
      // Clear LEDs
      if (currentItem.location && currentItem.unitIpAddress) {
        await clearSlotLight({
          ipAddress: currentItem.unitIpAddress!,
          slot: 1,
        });
      }

      // Mark as returned
      await markSessionRecordsReturnedByRecordIds([currentItem.record.id]);

      // Flash cyan briefly to indicate completion
      if (currentItem.location && currentItem.unitIpAddress) {
        const slots = currentItem.location.slotNumbers;
        await setSlotLight({
          ipAddress: currentItem.unitIpAddress!,
          slot: slots[0],
          allSlots: slots,
          color: '#08F7FE',
          brightness: 1.0,
          effect: 'steady',
        });
        await new Promise((resolve) => setTimeout(resolve, 150));
        await clearSlotLight({
          ipAddress: currentItem.unitIpAddress!,
          slot: 1,
        });
      }

      // Move to next
      if (currentIndex < items.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        // Mark all sessions as cleaned up
        await Promise.all(
          sessionIds.map((sessionId) =>
            updateSession({ sessionId, cleanedUp: true })
          )
        );

        Alert.alert('Complete', 'All records have been returned!', [
          { text: 'OK', onPress: () => navigation.navigate('ModesHome') },
        ]);
      }
    } catch (error) {
      logger.error('Failed to mark returned', error);
      Alert.alert('Error', 'Could not mark record as returned.');
    }
  };

  const handleCancel = async () => {
    if (currentItem?.location && currentItem?.unitIpAddress) {
      await clearSlotLight({
        ipAddress: currentItem.unitIpAddress!,
        slot: 1,
      });
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <AppScreen title="Preparing...">
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md }}>
            Loading records...
          </AppText>
        </View>
      </AppScreen>
    );
  }

  if (items.length === 0) {
    return (
      <AppScreen title="No Records">
        <AppCard>
          <AppText variant="body">No records need to be returned.</AppText>
          <AppButton
            title="Go Back"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>
      </AppScreen>
    );
  }

  const slotLabel = currentItem.location
    ? currentItem.location.slotNumbers.length === 1
      ? `Slot ${currentItem.location.slotNumbers[0]}`
      : `Slots ${currentItem.location.slotNumbers[0]}–${
          currentItem.location.slotNumbers[currentItem.location.slotNumbers.length - 1]
        }`
    : 'Not placed';

  return (
    <AppScreen title={`Returning: ${currentIndex + 1} of ${items.length}`}>
      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
          Return Record
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.xs }}>
          {currentItem.record.artist}
        </AppText>
        <AppText variant="body" style={{ marginBottom: spacing.md }}>
          {currentItem.record.title}
        </AppText>

        {currentItem.location ? (
          <>
            <View
              style={[
                styles.divider,
                { backgroundColor: colors.borderSubtle, marginVertical: spacing.md },
              ]}
            />
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              Return to Location
            </AppText>
            <AppText variant="body" style={{ marginBottom: spacing.lg }}>
              {slotLabel}
            </AppText>
          </>
        ) : (
          <View style={styles.warningBox}>
            <AppText variant="caption" style={{ color: colors.textSecondary }}>
              This record is not placed. Skip or assign a location first.
            </AppText>
          </View>
        )}

        {lighting && (
          <View style={styles.lightingIndicator}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText variant="caption" style={{ marginLeft: spacing.sm }}>
              Lighting slots...
            </AppText>
          </View>
        )}
      </AppCard>

      <View style={styles.actions}>
        <AppButton
          title="Cancel"
          variant="ghost"
          onPress={handleCancel}
          style={{ flex: 1 }}
        />
        <AppButton
          title={currentItem.location ? 'Returned' : 'Skip'}
          onPress={handleNext}
          disabled={lighting}
          style={{ flex: 1, marginLeft: spacing.sm }}
        />
      </View>
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
  divider: {
    height: 1,
    width: '100%',
  },
  warningBox: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(60, 78, 99, 0.3)',
    marginTop: 16,
  },
  lightingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
  },
});

