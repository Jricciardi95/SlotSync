import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  Alert,
} from 'react-native';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { StandsStackParamList } from '../navigation/types';
import {
  getShelfSlotGroupsByUnit,
  getUnitById,
  mergeShelfSlotGroups,
  splitShelfSlotGroup,
} from '../data/repository';
import { ShelfSlotGroup, Unit } from '../data/types';
import { AppIconButton } from '../components/AppIconButton';
import { setSlotLight } from '../services/ShelfLightingClient';

type Props = NativeStackScreenProps<StandsStackParamList, 'UnitLayout'>;

const columns = 8;
const gutter = 10;

export const UnitLayoutScreen: React.FC<Props> = ({ route }) => {
  const { unitId, unitName } = route.params;
  const { colors, spacing, radius } = useTheme();

  const [unit, setUnit] = useState<Unit | null>(null);
  const [groups, setGroups] = useState<ShelfSlotGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [selection, setSelection] = useState<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });
  const [activeGroup, setActiveGroup] = useState<ShelfSlotGroup | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const [lighting, setLighting] = useState(false);

  const loadUnitData = useCallback(async () => {
    setLoading(true);
    try {
      const [unitRecord, slotGroups] = await Promise.all([
        getUnitById(unitId),
        getShelfSlotGroupsByUnit(unitId),
      ]);
      setUnit(unitRecord);
      setGroups(slotGroups);
    } finally {
      setLoading(false);
    }
  }, [unitId]);

  useFocusEffect(
    useCallback(() => {
      loadUnitData();
    }, [loadUnitData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadUnitData();
    setRefreshing(false);
  }, [loadUnitData]);

  const onGridLayout = (event: LayoutChangeEvent) => {
    setGridWidth(event.nativeEvent.layout.width);
  };

  const resetSelection = () => {
    setSelection({ start: null, end: null });
  };

  const selectionRange = useMemo(() => {
    if (selection.start && selection.end) {
      const [min, max] =
        selection.start <= selection.end
          ? [selection.start, selection.end]
          : [selection.end, selection.start];
      const range: number[] = [];
      for (let i = min; i <= max; i += 1) {
        range.push(i);
      }
      return { min, max, slots: range };
    }
    return null;
  }, [selection]);

  const canMergeRange = useMemo(() => {
    if (!selectionRange) return false;
    const width = selectionRange.slots.length;
    if (width < 2 || width > 4) {
      return false;
    }
    return selectionRange.slots.every((slot) => {
      const groupForSlot = groups.find((group) =>
        group.physicalSlots.includes(slot)
      );
      return groupForSlot && groupForSlot.physicalSlots.length === 1;
    });
  }, [selectionRange, groups]);

  const handleSelectSlot = (slot: number) => {
    setSelection((prev) => {
      if (prev.start === null) {
        return { start: slot, end: null };
      }
      if (prev.start !== null && prev.end === null) {
        return { ...prev, end: slot };
      }
      return { start: slot, end: null };
    });
  };

  const handleGroupPress = (group: ShelfSlotGroup) => {
    if (!editMode) {
      setActiveGroup(group);
      setSheetVisible(true);
      return;
    }

    if (group.physicalSlots.length > 1) {
      if (group.recordId) {
        Alert.alert('Cannot split', 'Remove the record before splitting.');
        return;
      }
      Alert.alert(
        'Split group',
        `Split slots ${group.physicalSlots[0]}–${
          group.physicalSlots[group.physicalSlots.length - 1]
        } into single slots?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Split',
            style: 'destructive',
            onPress: async () => {
              await splitShelfSlotGroup(group.id, unitId, group.physicalSlots);
              await loadUnitData();
            },
          },
        ]
      );
      return;
    }

    handleSelectSlot(group.physicalSlots[0]);
  };

  const handleMerge = async () => {
    if (!selectionRange || !canMergeRange) {
      Alert.alert('Invalid selection', 'Select 2–4 single slots to merge.');
      return;
    }
    const ids = groups
      .filter((group) =>
        selectionRange.slots.includes(group.physicalSlots[0])
      )
      .map((group) => group.id);

    await mergeShelfSlotGroups(unitId, ids, selectionRange.slots);
    resetSelection();
    await loadUnitData();
  };

  const handleLightGroup = async () => {
    if (!unit || !activeGroup) return;
    try {
      setLighting(true);
      await Promise.all(
        activeGroup.physicalSlots.map((slot) =>
          setSlotLight({
            ipAddress: unit.ipAddress,
            slot,
            totalSlots: unit.totalSlots,
            color: '#08F7FE',
            brightness: 0.9,
            effect: 'steady',
          })
        )
      );
    } catch {
      // handled inside client
    } finally {
      setLighting(false);
    }
  };

  const gridTiles = useMemo(() => {
    if (!gridWidth) return [];
    const baseWidth = (gridWidth - gutter * (columns - 1)) / columns;

    return groups.map((group) => {
      const span = group.physicalSlots.length;
      const width = baseWidth * span + gutter * (span - 1);
      const firstSlot = group.physicalSlots[0];
      const lastSlot = group.physicalSlots[group.physicalSlots.length - 1];
      const inSelection =
        editMode &&
        selectionRange &&
        group.physicalSlots.some(
          (slot) => slot >= selectionRange.min && slot <= selectionRange.max
        );

      return {
        group,
        width,
        label: span > 1 ? `${firstSlot}–${lastSlot}` : `${firstSlot}`,
        inSelection,
      };
    });
  }, [groups, gridWidth, selectionRange, editMode]);

  const renderHeader = () => (
    <View
      style={[
        styles.headerRow,
        {
          backgroundColor: colors.surfaceAlt,
          borderColor: colors.borderSubtle,
        },
      ]}
    >
      <View>
        <AppText variant='subtitle'>{unitName ?? unit?.name}</AppText>
        <AppText variant='caption'>
          {unit ? `${unit.totalSlots} slots · IP ${unit.ipAddress}` : ''}
        </AppText>
      </View>
      <AppButton
        title={editMode ? 'Exit Edit Mode' : 'Edit Layout'}
        variant={editMode ? 'secondary' : 'primary'}
        onPress={() => {
          setEditMode((prev) => !prev);
          resetSelection();
        }}
      />
    </View>
  );

  const renderSelectionActions = () => {
    if (!editMode) return null;
    return (
      <View style={styles.selectionRow}>
        <View style={{ flex: 1 }}>
          <AppText variant='caption' style={{ color: colors.textSecondary }}>
            Tap start & end slots (2–4) to merge. Tap a wide group to split.
          </AppText>
          {selectionRange && (
            <AppText variant='body' style={{ marginTop: 4 }}>
              Selected slots {selectionRange.slots.join(', ')}
            </AppText>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <AppIconButton name='close' onPress={resetSelection} />
          <AppButton
            title='Merge'
            disabled={!canMergeRange}
            onPress={handleMerge}
          />
        </View>
      </View>
    );
  };

  const renderGrid = () => {
    if (loading) {
      return (
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant='caption' style={{ marginTop: 12 }}>
            Loading slots…
          </AppText>
        </View>
      );
    }

    return (
      <View style={styles.gridWrapper} onLayout={onGridLayout}>
        {gridTiles.map(({ group, width, label, inSelection }) => {
          const hasRecord = Boolean(group.recordId);
          return (
            <Pressable
              key={group.id}
              onPress={() => handleGroupPress(group)}
              style={[
                styles.slotGroup,
                {
                  width,
                  borderColor: inSelection
                    ? colors.accent
                    : colors.borderSubtle,
                  backgroundColor: hasRecord
                    ? colors.surface
                    : colors.backgroundMuted,
                },
              ]}
            >
              <AppText variant='body'>{label}</AppText>
              <View style={styles.groupFooter}>
                <AppText variant='caption'>
                  {group.physicalSlots.length > 1
                    ? `${group.physicalSlots.length} slots`
                    : 'Single slot'}
                </AppText>
                {hasRecord && (
                  <View
                    style={[
                      styles.recordDot,
                      { backgroundColor: colors.accent },
                    ]}
                  />
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  };

  return (
    <>
      <AppScreen
        title={unitName ?? 'Unit Layout'}
        subtitle='Visualize and edit physical slots.'
        scroll={false}
      >
        <ScrollView
          refreshControl={
            <RefreshControl
              tintColor={colors.accent}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
        >
          <View style={{ gap: spacing.lg }}>
            <AppCard style={{ gap: spacing.md }}>
              {renderHeader()}
              {renderSelectionActions()}
              {renderGrid()}
            </AppCard>
          </View>
        </ScrollView>
      </AppScreen>

      <Modal visible={sheetVisible} transparent animationType='slide'>
        <View style={styles.sheetOverlay}>
          <View
            style={[
              styles.sheetContent,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
              },
            ]}
          >
            <View style={styles.sheetHandle} />
            {activeGroup && (
              <>
                <AppText variant='subtitle' style={{ marginBottom: 8 }}>
                  Slots{' '}
                  {activeGroup.physicalSlots.length > 1
                    ? `${activeGroup.physicalSlots[0]}–${
                        activeGroup.physicalSlots[
                          activeGroup.physicalSlots.length - 1
                        ]
                      }`
                    : activeGroup.physicalSlots[0]}
                </AppText>
                <AppText variant='body'>
                  {activeGroup.recordId
                    ? 'Record assigned'
                    : 'No record assigned'}
                </AppText>
                <AppButton
                  title='Light Slot(s)'
                  style={{ marginTop: spacing.md }}
                  onPress={handleLightGroup}
                  disabled={lighting}
                />
                <AppButton
                  title='Close'
                  variant='ghost'
                  style={{ marginTop: spacing.sm }}
                  onPress={() => {
                    setSheetVisible(false);
                    setActiveGroup(null);
                  }}
                />
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  selectionRow: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 8,
    borderColor: 'rgba(248,248,248,0.12)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridWrapper: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: gutter,
  },
  slotGroup: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    justifyContent: 'space-between',
  },
  groupFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  recordDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  loadingState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  sheetContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    borderWidth: 1,
  },
  sheetHandle: {
    width: 48,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    backgroundColor: 'rgba(248,248,248,0.3)',
    marginBottom: 12,
  },
});

