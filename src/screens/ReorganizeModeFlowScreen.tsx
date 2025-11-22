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
  getSlotGroupsByRow,
  getRecordById,
  assignRecordToSlotGroup,
  getUnitById,
} from '../data/repository';
import { RecordModel, ShelfSlotGroup } from '../data/types';
import { setSlotLight, clearSlotLight } from '../services/ShelfLightingClient';

type Props = NativeStackScreenProps<ModesStackParamList, 'ReorganizeModeFlow'>;

type SlotGroupWithRecord = ShelfSlotGroup & {
  unitName: string;
  unitIpAddress: string;
  record: RecordModel | null;
};

type Swap = {
  groupA: SlotGroupWithRecord;
  groupB: SlotGroupWithRecord;
};

// Compute minimal swap sequence using a simple greedy approach
const computeSwaps = (
  current: SlotGroupWithRecord[],
  desired: SlotGroupWithRecord[]
): Swap[] => {
  const swaps: Swap[] = [];
  const working = [...current];

  // For each position in desired order
  for (let i = 0; i < desired.length; i += 1) {
    const desiredRecord = desired[i].record;
    if (!desiredRecord) continue;

    // Find where this record currently is
    const currentIndex = working.findIndex(
      (g) => g.record?.id === desiredRecord.id
    );

    if (currentIndex === i) continue; // Already in correct position

    if (currentIndex === -1) continue; // Record not found (shouldn't happen)

    // Swap current[i] with current[currentIndex]
    const swap: Swap = {
      groupA: working[i],
      groupB: working[currentIndex],
    };
    swaps.push(swap);

    // Perform swap in working array
    const temp = working[i];
    working[i] = working[currentIndex];
    working[currentIndex] = temp;
  }

  return swaps;
};

export const ReorganizeModeFlowScreen: React.FC<Props> = ({ route, navigation }) => {
  const { rowId, rowName, organizationRule } = route.params;
  const { colors, spacing } = useTheme();
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [lighting, setLighting] = useState(false);

  const currentSwap = useMemo(() => swaps[currentIndex], [swaps, currentIndex]);

  useEffect(() => {
    const buildSwaps = async () => {
      setLoading(true);
      try {
        const slotGroups = await getSlotGroupsByRow(rowId);

        // Filter to only groups with records
        const groupsWithRecords: SlotGroupWithRecord[] = [];
        for (const group of slotGroups) {
          if (!group.recordId) continue;
          const record = await getRecordById(group.recordId);
          if (!record) continue;

          groupsWithRecords.push({
            ...group,
            record,
          });
        }

        // Sort by current order (already sorted by positionIndex and slot)
        const currentOrder = [...groupsWithRecords];

        // Sort by desired order
        const desiredOrder = [...groupsWithRecords].sort((a, b) => {
          if (!a.record || !b.record) return 0;

          switch (organizationRule) {
            case 'title':
              return (a.record.title || '').localeCompare(b.record.title || '');
            case 'artist':
              return (a.record.artist || '').localeCompare(b.record.artist || '');
            case 'artistLastName':
              const aLast =
                a.record.artistLastName || a.record.artist.split(' ').pop() || '';
              const bLast =
                b.record.artistLastName || b.record.artist.split(' ').pop() || '';
              return aLast.localeCompare(bLast);
            case 'year':
              return (a.record.year || 0) - (b.record.year || 0);
            default:
              return 0;
          }
        });

        // Compute swaps
        const computedSwaps = computeSwaps(currentOrder, desiredOrder);
        setSwaps(computedSwaps);
      } catch (error) {
        console.error('Failed to build swaps', error);
        Alert.alert('Error', 'Could not prepare reorganization.');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    buildSwaps();
  }, [rowId, organizationRule, navigation]);

  useEffect(() => {
    if (!currentSwap) return;

    const lightSlots = async () => {
      setLighting(true);
      try {
        // Light group A in cyan
        await Promise.all(
          currentSwap.groupA.physicalSlots.map((slot) =>
            setSlotLight({
              ipAddress: currentSwap.groupA.unitIpAddress,
              slot,
              color: '#08F7FE',
              brightness: 0.9,
              effect: 'steady',
            })
          )
        );

        // Light group B in a lighter cyan variant
        await Promise.all(
          currentSwap.groupB.physicalSlots.map((slot) =>
            setSlotLight({
              ipAddress: currentSwap.groupB.unitIpAddress,
              slot,
              color: '#4EC9E0',
              brightness: 0.9,
              effect: 'steady',
            })
          )
        );
      } catch {
        // Error handled in client
      } finally {
        setLighting(false);
      }
    };

    lightSlots();

    return () => {
      // Clear lights when component unmounts or swap changes
      if (currentSwap) {
        currentSwap.groupA.physicalSlots.forEach((slot) => {
          clearSlotLight({
            ipAddress: currentSwap.groupA.unitIpAddress,
            slot,
          }).catch(() => {});
        });
        currentSwap.groupB.physicalSlots.forEach((slot) => {
          clearSlotLight({
            ipAddress: currentSwap.groupB.unitIpAddress,
            slot,
          }).catch(() => {});
        });
      }
    };
  }, [currentSwap]);

  const handleDone = async () => {
    if (!currentSwap) return;

    try {
      // Clear LEDs
      await Promise.all([
        ...currentSwap.groupA.physicalSlots.map((slot) =>
          clearSlotLight({
            ipAddress: currentSwap.groupA.unitIpAddress,
            slot,
          })
        ),
        ...currentSwap.groupB.physicalSlots.map((slot) =>
          clearSlotLight({
            ipAddress: currentSwap.groupB.unitIpAddress,
            slot,
          })
        ),
      ]);

      // Update locations: swap the records
      if (currentSwap.groupA.record && currentSwap.groupB.record) {
        await Promise.all([
          assignRecordToSlotGroup({
            recordId: currentSwap.groupA.record.id,
            slotGroupId: currentSwap.groupB.id,
          }),
          assignRecordToSlotGroup({
            recordId: currentSwap.groupB.record.id,
            slotGroupId: currentSwap.groupA.id,
          }),
        ]);
      }

      // Move to next swap
      if (currentIndex < swaps.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        Alert.alert('Complete', 'Reorganization complete!', [
          { text: 'OK', onPress: () => navigation.navigate('ModesHome') },
        ]);
      }
    } catch (error) {
      console.error('Failed to complete swap', error);
      Alert.alert('Error', 'Could not complete swap.');
    }
  };

  const handleCancel = async () => {
    if (currentSwap) {
      await Promise.all([
        ...currentSwap.groupA.physicalSlots.map((slot) =>
          clearSlotLight({
            ipAddress: currentSwap.groupA.unitIpAddress,
            slot,
          })
        ),
        ...currentSwap.groupB.physicalSlots.map((slot) =>
          clearSlotLight({
            ipAddress: currentSwap.groupB.unitIpAddress,
            slot,
          })
        ),
      ]);
    }
    navigation.goBack();
  };

  if (loading) {
    return (
      <AppScreen title="Preparing...">
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md }}>
            Computing swap sequence...
          </AppText>
        </View>
      </AppScreen>
    );
  }

  if (swaps.length === 0) {
    return (
      <AppScreen title="No Swaps Needed">
        <AppCard>
          <AppText variant="body">
            Your collection is already organized according to this rule.
          </AppText>
          <AppButton
            title="Go Back"
            onPress={() => navigation.goBack()}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>
      </AppScreen>
    );
  }

  const slotLabelA =
    currentSwap.groupA.physicalSlots.length === 1
      ? `Slot ${currentSwap.groupA.physicalSlots[0]}`
      : `Slots ${currentSwap.groupA.physicalSlots[0]}–${
          currentSwap.groupA.physicalSlots[currentSwap.groupA.physicalSlots.length - 1]
        }`;

  const slotLabelB =
    currentSwap.groupB.physicalSlots.length === 1
      ? `Slot ${currentSwap.groupB.physicalSlots[0]}`
      : `Slots ${currentSwap.groupB.physicalSlots[0]}–${
          currentSwap.groupB.physicalSlots[currentSwap.groupB.physicalSlots.length - 1]
        }`;

  return (
    <AppScreen title={`Swap ${currentIndex + 1} of ${swaps.length}`}>
      <AppCard>
        <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
          Swap these two records
        </AppText>

        <View style={styles.swapGroup}>
          <View style={[styles.recordBox, { borderColor: colors.accent }]}>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Record A (Cyan)
            </AppText>
            {currentSwap.groupA.record ? (
              <>
                <AppText variant="body" style={{ marginBottom: spacing.xs }}>
                  {currentSwap.groupA.record.artist}
                </AppText>
                <AppText variant="body" style={{ marginBottom: spacing.sm }}>
                  {currentSwap.groupA.record.title}
                </AppText>
                <AppText variant="caption">{currentSwap.groupA.unitName}</AppText>
                <AppText variant="caption">{slotLabelA}</AppText>
              </>
            ) : (
              <AppText variant="caption">Empty</AppText>
            )}
          </View>

          <View style={[styles.recordBox, { borderColor: '#4EC9E0' }]}>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Record B (Light Cyan)
            </AppText>
            {currentSwap.groupB.record ? (
              <>
                <AppText variant="body" style={{ marginBottom: spacing.xs }}>
                  {currentSwap.groupB.record.artist}
                </AppText>
                <AppText variant="body" style={{ marginBottom: spacing.sm }}>
                  {currentSwap.groupB.record.title}
                </AppText>
                <AppText variant="caption">{currentSwap.groupB.unitName}</AppText>
                <AppText variant="caption">{slotLabelB}</AppText>
              </>
            ) : (
              <AppText variant="caption">Empty</AppText>
            )}
          </View>
        </View>

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
          title="Done"
          onPress={handleDone}
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
  swapGroup: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 16,
  },
  recordBox: {
    flex: 1,
    padding: 16,
    borderRadius: 8,
    borderWidth: 2,
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

