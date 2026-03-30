/**
 * PR7: Virtual Shelf Screen
 * 
 * Grid layout representing slots for a unit (shelf).
 * Allows assigning/unassigning records to slots.
 * Simulates LED lighting for future hardware integration.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppCard } from '../components/AppCard';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import {
  getUnitById,
  getSlotsWithAssignments,
  assignRecordToSlot,
  unassignRecordFromSlot,
  getSlotAssignmentByRecord,
} from '../data/repository';
import { Unit, SlotWithAssignment, RecordModel } from '../data/types';
import { lightSlotHighlight, lightSlotOff } from '../utils/ledControl';
import { logger } from '../utils/logger';
import { getRecordById } from '../data/repository';

type Props = NativeStackScreenProps<LibraryStackParamList, 'VirtualShelf'>;

const SLOTS_PER_ROW = 5; // Grid layout: 5 slots per row

export const VirtualShelfScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const { unitId, recordId } = route.params || {};
  
  const [unit, setUnit] = useState<Unit | null>(null);
  const [slots, setSlots] = useState<SlotWithAssignment[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<RecordModel | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState(false);

  // Load unit and slots
  useEffect(() => {
    const loadData = async () => {
      if (!unitId) {
        logger.warn('[VirtualShelf] No unitId provided');
        navigation.goBack();
        return;
      }

      try {
        setLoading(true);
        const [unitData, slotsData] = await Promise.all([
          getUnitById(unitId),
          getSlotsWithAssignments(unitId),
        ]);

        if (!unitData) {
          Alert.alert('Error', 'Unit not found');
          navigation.goBack();
          return;
        }

        setUnit(unitData);
        setSlots(slotsData);

        // If recordId provided, load and highlight its slot
        if (recordId) {
          const record = await getRecordById(recordId);
          if (record) {
            setSelectedRecord(record);
            const assignment = await getSlotAssignmentByRecord(recordId);
            if (assignment) {
              setSelectedSlotId(assignment.slotId);
              // PR7: Emit LED highlight for assigned slot
              const slot = slotsData.find((s) => s.id === assignment.slotId);
              if (slot) {
                lightSlotHighlight(unitId, assignment.slotId, slot.slotNumber);
              }
            }
          }
        }
      } catch (error: any) {
        logger.error('[VirtualShelf] Failed to load data:', error);
        Alert.alert('Error', 'Failed to load shelf data');
        navigation.goBack();
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [unitId, recordId, navigation]);

  // Handle slot tap
  const handleSlotTap = useCallback(
    async (slot: SlotWithAssignment) => {
      if (assigning) return;

      // If no record selected, show message
      if (!selectedRecord) {
        Alert.alert(
          'Select a Record',
          'Please select a record from the library first, then tap a slot to assign it.',
          [
            {
              text: 'Go to Library',
              onPress: () => navigation.navigate('Library'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      // If slot already has this record, unassign it
      if (slot.recordId === selectedRecord.id) {
        try {
          setAssigning(true);
          await unassignRecordFromSlot(selectedRecord.id);
          lightSlotOff(unitId, slot.id, slot.slotNumber);
          
          // Reload slots
          const updatedSlots = await getSlotsWithAssignments(unitId);
          setSlots(updatedSlots);
          setSelectedSlotId(null);
          
          logger.debug('[VirtualShelf] Unassigned record from slot', {
            recordId: selectedRecord.id,
            slotNumber: slot.slotNumber,
          });
        } catch (error: any) {
          logger.error('[VirtualShelf] Failed to unassign:', error);
          Alert.alert('Error', 'Failed to unassign record from slot');
        } finally {
          setAssigning(false);
        }
        return;
      }

      // If slot has another record, ask to replace
      if (slot.recordId) {
        Alert.alert(
          'Slot Occupied',
          `Slot ${slot.slotNumber} is already assigned to "${slot.recordArtist} - ${slot.recordTitle}". Do you want to replace it?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Replace',
              style: 'destructive',
              onPress: async () => {
                try {
                  setAssigning(true);
                  await assignRecordToSlot(selectedRecord.id, slot.id);
                  lightSlotHighlight(unitId, slot.id, slot.slotNumber);
                  
                  // Reload slots
                  const updatedSlots = await getSlotsWithAssignments(unitId);
                  setSlots(updatedSlots);
                  setSelectedSlotId(slot.id);
                  
                  logger.debug('[VirtualShelf] Assigned record to slot', {
                    recordId: selectedRecord.id,
                    slotNumber: slot.slotNumber,
                  });
                } catch (error: any) {
                  logger.error('[VirtualShelf] Failed to assign:', error);
                  Alert.alert('Error', error.message || 'Failed to assign record to slot');
                } finally {
                  setAssigning(false);
                }
              },
            },
          ]
        );
        return;
      }

      // Assign record to empty slot
      try {
        setAssigning(true);
        await assignRecordToSlot(selectedRecord.id, slot.id);
        lightSlotHighlight(unitId, slot.id, slot.slotNumber);
        
        // Reload slots
        const updatedSlots = await getSlotsWithAssignments(unitId);
        setSlots(updatedSlots);
        setSelectedSlotId(slot.id);
        
        logger.debug('[VirtualShelf] Assigned record to slot', {
          recordId: selectedRecord.id,
          slotNumber: slot.slotNumber,
        });
      } catch (error: any) {
        logger.error('[VirtualShelf] Failed to assign:', error);
        Alert.alert('Error', error.message || 'Failed to assign record to slot');
      } finally {
        setAssigning(false);
      }
    },
    [selectedRecord, unitId, assigning, navigation]
  );

  if (loading) {
    return (
      <AppScreen title="Virtual Shelf">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md }}>
            Loading shelf...
          </AppText>
        </View>
      </AppScreen>
    );
  }

  if (!unit) {
    return (
      <AppScreen title="Virtual Shelf">
        <View style={styles.errorContainer}>
          <AppText variant="body">Unit not found</AppText>
        </View>
      </AppScreen>
    );
  }

  // Group slots into rows
  const rows: SlotWithAssignment[][] = [];
  for (let i = 0; i < slots.length; i += SLOTS_PER_ROW) {
    rows.push(slots.slice(i, i + SLOTS_PER_ROW));
  }

  return (
    <AppScreen title={unit.name || 'Virtual Shelf'}>
      <ScrollView style={styles.container}>
        {/* Selected Record Info */}
        {selectedRecord && (
          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              Selected Record
            </AppText>
            <AppText variant="body" style={{ fontWeight: '600' }}>
              {selectedRecord.artist} - {selectedRecord.title}
            </AppText>
            {selectedSlotId && (
              <AppText variant="caption" style={{ marginTop: spacing.xs, color: colors.accent }}>
                ✓ Assigned to slot {slots.find((s) => s.id === selectedSlotId)?.slotNumber}
              </AppText>
            )}
            {!selectedSlotId && (
              <AppText variant="caption" style={{ marginTop: spacing.xs, color: colors.textMuted }}>
                Tap a slot below to assign this record
              </AppText>
            )}
          </AppCard>
        )}

        {!selectedRecord && (
          <AppCard style={{ marginBottom: spacing.md }}>
            <AppText variant="body" style={{ marginBottom: spacing.sm }}>
              No record selected
            </AppText>
            <AppButton
              title="Select from Library"
              onPress={() => navigation.navigate('Library')}
            />
          </AppCard>
        )}

        {/* Slot Grid */}
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
            Slots ({slots.length} total)
          </AppText>
          <View style={styles.grid}>
            {rows.map((row, rowIndex) => (
              <View key={rowIndex} style={styles.row}>
                {row.map((slot) => {
                  const isSelected = selectedSlotId === slot.id;
                  const isAssigned = !!slot.recordId;
                  const isAssignedToSelected = slot.recordId === selectedRecord?.id;

                  return (
                    <TouchableOpacity
                      key={slot.id}
                      style={[
                        styles.slot,
                        {
                          backgroundColor: isSelected
                            ? colors.accentMuted
                            : isAssigned
                            ? colors.surfaceAlt
                            : colors.backgroundMuted,
                          borderColor: isSelected
                            ? colors.accent
                            : isAssignedToSelected
                            ? colors.accent
                            : colors.borderSubtle,
                          borderWidth: isSelected || isAssignedToSelected ? 2 : 1,
                          borderRadius: radius.sm,
                        },
                      ]}
                      onPress={() => handleSlotTap(slot)}
                      disabled={assigning}
                    >
                      <AppText
                        variant="caption"
                        style={{
                          color: isSelected ? colors.accent : colors.textSecondary,
                          fontWeight: isSelected ? '600' : '400',
                        }}
                      >
                        {slot.slotNumber}
                      </AppText>
                      {isAssigned && (
                        <AppText
                          variant="caption"
                          style={{
                            fontSize: 10,
                            color: colors.textMuted,
                            marginTop: 2,
                            textAlign: 'center',
                          }}
                          numberOfLines={2}
                        >
                          {slot.recordArtist && slot.recordTitle
                            ? `${slot.recordArtist} - ${slot.recordTitle}`
                            : 'Assigned'}
                        </AppText>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {/* Fill empty slots in row */}
                {row.length < SLOTS_PER_ROW &&
                  Array.from({ length: SLOTS_PER_ROW - row.length }).map((_, idx) => (
                    <View key={`empty-${idx}`} style={styles.slot} />
                  ))}
              </View>
            ))}
          </View>
        </AppCard>
      </ScrollView>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  grid: {
    gap: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  slot: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 8,
    minHeight: 60,
  },
});


