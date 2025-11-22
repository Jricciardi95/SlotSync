import React, { useCallback, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Image,
  StyleSheet,
  View,
  Alert,
  Modal,
  TouchableOpacity,
  ScrollView,
  Animated,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import {
  getRecordById,
  getRecordLocationDetails,
  getRows,
  getUnitsByRow,
  getShelfSlotGroupsByUnit,
  assignRecordToSlotGroup,
  getUnitById,
  getActiveSession,
  createSession,
  createSessionRecord,
  getTracksByRecord,
  createTrack,
  deleteTrack,
  updateTrack,
  deleteRecord,
} from '../data/repository';
import {
  RecordModel,
  RecordLocationDetails,
  Row,
  Unit,
  ShelfSlotGroup,
  Track,
} from '../data/types';
import { LibraryStackParamList } from '../navigation/types';
import { setSlotLight } from '../services/ShelfLightingClient';

type Props = NativeStackScreenProps<LibraryStackParamList, 'RecordDetail'>;

export const RecordDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const { recordId } = route.params;

  const [record, setRecord] = useState<RecordModel | null>(null);
  const [location, setLocation] = useState<RecordLocationDetails | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [lighting, setLighting] = useState(false);

  const [assignVisible, setAssignVisible] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [slotGroups, setSlotGroups] = useState<ShelfSlotGroup[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordData, locationData, tracksData] = await Promise.all([
        getRecordById(recordId),
        getRecordLocationDetails(recordId),
        getTracksByRecord(recordId),
      ]);
      setRecord(recordData);
      setLocation(locationData);
      setTracks(tracksData);
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openAssign = async () => {
    setAssignVisible(true);
    setPickerLoading(true);
    try {
      const fetchedRows = await getRows();
      setRows(fetchedRows);
      setUnits([]);
      setSlotGroups([]);
      setSelectedRow(null);
      setSelectedUnit(null);
    } finally {
      setPickerLoading(false);
    }
  };

  const closeAssign = () => {
    setAssignVisible(false);
    setSelectedRow(null);
    setSelectedUnit(null);
    setSlotGroups([]);
  };

  const handleSelectRow = async (row: Row) => {
    setSelectedRow(row);
    setSelectedUnit(null);
    setSlotGroups([]);
    setPickerLoading(true);
    try {
      const fetchedUnits = await getUnitsByRow(row.id);
      setUnits(fetchedUnits);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleSelectUnit = async (unit: Unit) => {
    setSelectedUnit(unit);
    setPickerLoading(true);
    try {
      const groups = await getShelfSlotGroupsByUnit(unit.id);
      setSlotGroups(groups);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleAssignToGroup = async (group: ShelfSlotGroup) => {
    if (group.recordId && group.recordId !== recordId) {
      Alert.alert('Slot in use', 'Choose an empty slot group.');
      return;
    }
    try {
      setPickerLoading(true);
      await assignRecordToSlotGroup({ recordId, slotGroupId: group.id });
      await load();
      closeAssign();
    } catch (error) {
      Alert.alert('Assignment failed', 'Please try again.');
      console.log(error);
    } finally {
      setPickerLoading(false);
    }
  };

  const handleLight = async () => {
    if (!location) return;
    const unitRecord = await getUnitById(location.unitId);
    if (!unitRecord) {
      Alert.alert('Unit not found', 'This unit no longer exists.');
      return;
    }
    try {
      setLighting(true);
      await Promise.all(
        location.slotNumbers.map((slot) =>
          setSlotLight({
            ipAddress: unitRecord.ipAddress,
            slot,
            totalSlots: unitRecord.totalSlots,
            color: '#08F7FE',
            brightness: 0.9,
            effect: 'steady',
          })
        )
      );
    } catch (error) {
      console.log(error);
    } finally {
      setLighting(false);
    }
  };

  const handleAddToSession = async () => {
    if (!record) return;

    try {
      let session = await getActiveSession();
      if (!session) {
        session = await createSession();
      }

      await createSessionRecord({
        sessionId: session.id,
        recordId: record.id,
      });

      Alert.alert('Added to session', 'Record added to current listening session.');
    } catch (error) {
      console.error('Failed to add to session', error);
      Alert.alert('Error', 'Could not add record to session.');
    }
  };

  const handleDelete = () => {
    if (!record) return;
    
    Alert.alert(
      'Delete Album',
      `Are you sure you want to delete "${record.artist} - ${record.title}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecord(recordId);
              // Navigate back to library
              navigation.navigate('LibraryHome');
            } catch (error) {
              console.error('Failed to delete record', error);
              Alert.alert('Error', 'Could not delete record.');
            }
          },
        },
      ]
    );
  };

  // Swipe-to-delete functionality
  const swipeAnim = useRef(new Animated.Value(0)).current;
  const [showDeleteButton, setShowDeleteButton] = useState(false);

  const resetSwipe = useCallback(() => {
    Animated.spring(swipeAnim, {
      toValue: 0,
      useNativeDriver: true,
    }).start();
    setShowDeleteButton(false);
  }, [swipeAnim]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !showDeleteButton, // Don't respond if delete button is already shown
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to horizontal swipes
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
      },
      onPanResponderMove: (_, gestureState) => {
        if (showDeleteButton) {
          // If delete button is shown, allow swiping right to close
          if (gestureState.dx > 0) {
            swipeAnim.setValue(gestureState.dx - 120);
          }
        } else {
          // Only allow swiping left (negative dx)
          if (gestureState.dx < 0) {
            swipeAnim.setValue(gestureState.dx);
          }
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        const swipeThreshold = -100; // Swipe left threshold
        
        if (showDeleteButton) {
          // If delete button is shown, swipe right to close
          if (gestureState.dx > 50) {
            resetSwipe();
          } else {
            // Snap back to delete position
            Animated.spring(swipeAnim, {
              toValue: -120,
              useNativeDriver: true,
            }).start();
          }
        } else {
          // Swipe left to show delete
          if (gestureState.dx < swipeThreshold) {
            // Swipe left enough - show delete button
            Animated.spring(swipeAnim, {
              toValue: -120,
              useNativeDriver: true,
            }).start();
            setShowDeleteButton(true);
          } else {
            // Not enough swipe - snap back
            resetSwipe();
          }
        }
      },
    })
  ).current;

  const slotLabel = useMemo(() => {
    if (!location) return 'Not placed yet';
    return location.slotNumbers.length > 1
      ? `${location.slotNumbers[0]}–${
          location.slotNumbers[location.slotNumbers.length - 1]
        }`
      : `${location.slotNumbers[0]}`;
  }, [location]);

  if (loading || !record) {
    return (
      <AppScreen title="Album Details">
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  return (
    <>
      <AppScreen title={record.title} subtitle={record.artist}>
        <View style={{ gap: spacing.lg }}>
          {/* Swipeable delete container */}
          <View style={{ position: 'relative', overflow: 'hidden' }}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={showDeleteButton ? resetSwipe : undefined}
              style={{ flex: 1 }}
            >
              <Animated.View
                style={{
                  transform: [{ translateX: swipeAnim }],
                }}
                {...panResponder.panHandlers}
              >
              <AppCard style={{ gap: spacing.md }}>
                {record.coverImageRemoteUrl || record.coverImageLocalUri ? (
                  <Image
                    source={{ 
                      uri: record.coverImageRemoteUrl || record.coverImageLocalUri || ''
                    }}
                    style={styles.detailCover}
                  />
                ) : (
                  <View
                    style={[
                      styles.detailCover,
                      {
                        backgroundColor: colors.backgroundMuted,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                  >
                    <AppText variant="caption">No cover yet</AppText>
                  </View>
                )}
                {record.year && (
                  <AppText variant="body">Year: {record.year}</AppText>
                )}
                {record.notes && (
                  <AppText variant="body" style={{ color: colors.textSecondary }}>
                    Notes: {record.notes}
                  </AppText>
                )}
              </AppCard>
              </Animated.View>
            </TouchableOpacity>
            
            {/* Delete button revealed on swipe */}
            {showDeleteButton && (
              <TouchableOpacity
                style={[
                  styles.deleteButton,
                  {
                    backgroundColor: '#FF3B30',
                    right: 0,
                  },
                ]}
                onPress={handleDelete}
                activeOpacity={0.8}
              >
                <AppText variant="body" style={{ color: 'white', fontWeight: '600' }}>
                  Delete
                </AppText>
              </TouchableOpacity>
            )}
          </View>

          <AppCard style={{ gap: spacing.sm }}>
            <AppText variant="subtitle">Location</AppText>
            {location ? (
              <>
                <AppText variant="body">
                  Row: {location.rowName ?? 'Unassigned'}
                </AppText>
                <AppText variant="body">Unit: {location.unitName}</AppText>
                <AppText variant="body">Slots: {slotLabel}</AppText>
              </>
            ) : (
              <AppText variant="body">Not placed yet</AppText>
            )}
            <AppButton title="Assign / Change Location" onPress={openAssign} />
            <AppButton
              title="Light Slot"
              variant="secondary"
              disabled={!location || lighting}
              onPress={handleLight}
            />
          </AppCard>

          <AppCard style={{ gap: spacing.sm }}>
            <AppText variant="subtitle">Session</AppText>
            <AppText variant="caption" style={{ color: colors.textSecondary }}>
              Add this record to your current listening session
            </AppText>
            <AppButton
              title="Add to Current Session"
              variant="secondary"
              onPress={handleAddToSession}
            />
          </AppCard>

          <AppCard style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <AppText variant="subtitle">Tracks</AppText>
              <AppButton
                title="Delete Album"
                variant="ghost"
                onPress={handleDelete}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
              />
            </View>
            {tracks.length === 0 ? (
              <AppText variant="caption" style={{ color: colors.textSecondary }}>
                No tracks added yet. Tracks can be populated automatically from the identification service or added manually.
              </AppText>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {tracks.map((track) => (
                  <View
                    key={track.id}
                    style={{
                      padding: spacing.sm,
                      backgroundColor: colors.backgroundMuted,
                      borderRadius: radius.sm,
                    }}
                  >
                    <AppText variant="body">
                      {track.trackNumber && `${track.trackNumber}. `}
                      {track.title}
                    </AppText>
                    {track.side && (
                      <AppText variant="caption" style={{ color: colors.textSecondary }}>
                        Side {track.side}
                      </AppText>
                    )}
                    {track.durationSeconds && (
                      <AppText variant="caption" style={{ color: colors.textSecondary }}>
                        {Math.floor(track.durationSeconds / 60)}:{(track.durationSeconds % 60).toString().padStart(2, '0')}
                      </AppText>
                    )}
                  </View>
                ))}
              </View>
            )}
          </AppCard>
        </View>
      </AppScreen>

      <Modal visible={assignVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.lg,
              },
            ]}
          >
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              Assign Location
            </AppText>
            {pickerLoading && (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.accent} />
              </View>
            )}
            {!pickerLoading && (
              <ScrollView style={{ maxHeight: 380 }} contentContainerStyle={{ gap: spacing.md }}>
                {!selectedRow &&
                  rows.map((row) => (
                    <TouchableOpacity
                      key={row.id}
                      style={[
                        styles.assignRow,
                        {
                          borderColor: colors.borderSubtle,
                          backgroundColor: colors.surfaceAlt,
                        },
                      ]}
                      onPress={() => handleSelectRow(row)}
                    >
                      <AppText variant="body">{row.name}</AppText>
                    </TouchableOpacity>
                  ))}

                {selectedRow && !selectedUnit && (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="caption">
                      Units in {selectedRow.name}
                    </AppText>
                    {units.map((unit) => (
                      <TouchableOpacity
                        key={unit.id}
                        style={[
                          styles.assignRow,
                          {
                            borderColor: colors.borderSubtle,
                            backgroundColor: colors.surfaceAlt,
                          },
                        ]}
                        onPress={() => handleSelectUnit(unit)}
                      >
                        <AppText variant="body">{unit.name}</AppText>
                        <AppText variant="caption">
                          {unit.totalSlots} slots
                        </AppText>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}

                {selectedUnit && (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="caption">
                      Choose slots in {selectedUnit.name}
                    </AppText>
                    <View style={styles.slotGrid}>
                      {slotGroups.map((group) => (
                        <TouchableOpacity
                          key={group.id}
                          style={[
                            styles.slotItem,
                            {
                              borderColor: group.recordId
                                ? colors.textMuted
                                : colors.borderSubtle,
                              backgroundColor: group.recordId
                                ? colors.backgroundMuted
                                : colors.surfaceAlt,
                            },
                          ]}
                          onPress={() => handleAssignToGroup(group)}
                        >
                          <AppText variant="body">
                            {group.physicalSlots.length > 1
                              ? `${group.physicalSlots[0]}–${
                                  group.physicalSlots[
                                    group.physicalSlots.length - 1
                                  ]
                                }`
                              : group.physicalSlots[0]}
                          </AppText>
                          {group.recordId && (
                            <AppText variant="caption" style={{ color: colors.textMuted }}>
                              In use
                            </AppText>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>
            )}

            <AppButton
              title={selectedRow ? 'Back' : 'Close'}
              variant="ghost"
              onPress={() => {
                if (selectedUnit) {
                  setSelectedUnit(null);
                  setSlotGroups([]);
                } else if (selectedRow) {
                  setSelectedRow(null);
                  setUnits([]);
                } else {
                  closeAssign();
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteButton: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  detailCover: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 16,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  centered: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  assignRow: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 12,
  },
  slotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  slotItem: {
    padding: 12,
    borderWidth: 1,
    borderRadius: 10,
    minWidth: 90,
  },
});

