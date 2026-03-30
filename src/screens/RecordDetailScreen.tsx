import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
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
  getSlotAssignmentDetails,
  getSlotAssignmentByRecord,
} from '../data/repository';
import { identifyRecord } from '../services/RecordIdentificationService';
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
import { AppIconButton } from '../components/AppIconButton';

type Props = NativeStackScreenProps<LibraryStackParamList, 'RecordDetail'>;

export const RecordDetailScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, spacing, radius } = useTheme();
  // Get recordId from route params, with fallback to navigation params (for custom navigation)
  const recordId = route.params?.recordId || (navigation as any).params?.recordId;
  // Get returnToTab to restore the correct tab when going back
  const returnToTab = route.params?.returnToTab || (navigation as any).params?.returnToTab;

  // Debug logging
  useEffect(() => {
    console.log('[RecordDetail] Mounted with params:', {
      routeParams: route.params,
      navParams: (navigation as any).params,
      recordId,
      hasRecordId: !!recordId,
      returnToTab,
    });
  }, [recordId, returnToTab]);

  // CRITICAL: Guard against missing recordId in route params
  // Use useEffect to navigate (can't call navigation during render)
  useEffect(() => {
    if (!recordId) {
      console.error('[RecordDetail] Missing recordId in route params, navigating back', {
        routeParams: route.params,
        navParams: (navigation as any).params,
      });
      // Navigate back if we can, otherwise go to LibraryHome
      // Use setTimeout to ensure this happens after render
      setTimeout(() => {
        if (navigation.canGoBack && navigation.canGoBack()) {
          navigation.goBack();
        } else {
          navigation.navigate('LibraryHome');
        }
      }, 100);
    }
  }, [recordId, navigation]);

  // Show error UI if recordId is missing (instead of returning null during render)
  if (!recordId) {
    return (
      <AppScreen title="Album Details">
        <View style={styles.loadingState}>
          <AppText variant="body">Invalid album ID. Please try again.</AppText>
        </View>
      </AppScreen>
    );
  }

  const [record, setRecord] = useState<RecordModel | null>(null);
  const [location, setLocation] = useState<RecordLocationDetails | null>(null);
  const [slotAssignment, setSlotAssignment] = useState<Awaited<ReturnType<typeof getSlotAssignmentDetails>> | null>(null); // PR7: Slot assignment
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  // Track whether we've successfully loaded this record at least once
  // Once loaded, we never show the full-screen spinner again (even on navigation back)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [lighting, setLighting] = useState(false);
  const [fetchingTracks, setFetchingTracks] = useState(false);

  const [assignVisible, setAssignVisible] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [slotGroups, setSlotGroups] = useState<ShelfSlotGroup[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Row | null>(null);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);

  const load = useCallback(async (showSpinner = true) => {
    console.log('[RecordDetail] load() called', {
      showSpinner,
      hasRecord: !!record,
      recordId: record?.id,
      expectedRecordId: recordId,
    });
    
    // Only set loading if we don't have record data yet, or if explicitly requested
    // CRITICAL: Never show spinner if we already have record data (prevents spinner on navigation back)
    if (showSpinner && (!record || record.id !== recordId)) {
      console.log('[RecordDetail] Setting loading=true (showSpinner=true, no record data)');
      setLoading(true);
    } else {
      // If we have record data, ensure loading is false to prevent any spinner flash
      console.log('[RecordDetail] Setting loading=false (have record data or showSpinner=false)');
      setLoading(false);
    }
    try {
      const [recordData, locationData, tracksData, slotAssignmentData] = await Promise.all([
        getRecordById(recordId),
        getRecordLocationDetails(recordId),
        getTracksByRecord(recordId),
        getSlotAssignmentDetails(recordId), // PR7: Load slot assignment
      ]);
      console.log('[RecordDetail] Loaded record:', {
        id: recordData?.id,
        artist: recordData?.artist,
        title: recordData?.title,
        year: recordData?.year,
        tracksCount: tracksData.length,
        tracks: tracksData,
      });
      // CRITICAL: Only update record if we got valid data
      // This prevents clearing the record state if the API call fails
      // Also, preserve existing record if new data is null/undefined (defensive)
      if (recordData) {
        setRecord(recordData);
        // ✅ Mark that we've loaded this record at least once
        // This ensures we never show the full-screen spinner after the first successful load
        setHasLoadedOnce(true);
        console.log('[RecordDetail] ✅ Record loaded successfully, hasLoadedOnce=true');
      } else if (!recordData && record) {
        // If API returns null but we have existing record, keep the existing record
        // This prevents clearing record state on failed API calls
        console.warn('[RecordDetail] API returned null record, preserving existing record data');
      }
      setLocation(locationData);
      setSlotAssignment(slotAssignmentData); // PR7: Set slot assignment
      setTracks(tracksData);
    } catch (error) {
      console.error('[RecordDetail] Error loading record:', error);
      // Don't clear record state on error - keep existing data
    } finally {
      console.log('[RecordDetail] load() completed, setting loading=false');
      setLoading(false);
    }
  }, [recordId, record]);

  useFocusEffect(
    useCallback(() => {
      console.log('[RecordDetail] useFocusEffect triggered', {
        hasLoadedOnce,
        hasRecord: !!record,
        recordId: record?.id,
        expectedRecordId: recordId,
        loading,
      });
      
      if (!hasLoadedOnce) {
        // First time we ever open this record → allow full-screen spinner
        console.log('[RecordDetail] First load - allowing full-screen spinner');
        load(true);
      } else {
        // Coming back from edit or navigating again to the same record:
        // show existing UI immediately and just refresh in the background
        console.log('[RecordDetail] Returning to already-loaded record - refreshing in background (no spinner)');
        setLoading(false);
        load(false).catch(err => {
          console.error('[RecordDetail] Background refresh failed:', err);
          // Don't show error to user - just log it
        });
      }
    }, [load, hasLoadedOnce])
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

  const handleLookupMetadata = async () => {
    if (!record || !record.artist || !record.title) {
      Alert.alert('Missing info', 'Artist and title are required to lookup metadata.');
      return;
    }

    setFetchingTracks(true);
    try {
      console.log(`[RecordDetail] Looking up metadata for "${record.artist}" - "${record.title}"`);
      
      // Use text-based lookup (works without cover image)
      const { identifyRecordByText } = await import('../services/RecordIdentificationService');
      const response = await identifyRecordByText(record.artist, record.title);
      
      if (response.bestMatch) {
        const match = response.bestMatch;
        const updates: any = {};
        
        // Update cover art if we don't have one or if we got a better one
        if (match.coverImageRemoteUrl && (!record.coverImageRemoteUrl || !record.coverImageLocalUri)) {
          updates.coverImageRemoteUrl = match.coverImageRemoteUrl;
        }
        
        // Update year if we don't have one
        if (match.year && !record.year) {
          updates.year = match.year;
        }
        
        // Update discogsId if we don't have one
        if (match.discogsId && !record.discogsId) {
          updates.discogsId = String(match.discogsId);
        }
        
        // Save updates if any
        if (Object.keys(updates).length > 0) {
          const { updateRecord } = await import('../data/repository');
          await updateRecord(recordId, updates);
          console.log(`[RecordDetail] ✅ Updated record metadata:`, updates);
        }
        
        // Add tracks if we have them and don't already have tracks
        if (match.tracks && Array.isArray(match.tracks) && match.tracks.length > 0 && tracks.length === 0) {
          const { createTrack } = await import('../data/repository');
          let savedCount = 0;
          for (const track of match.tracks) {
            try {
              if (track.title && track.title.trim()) {
                await createTrack({
                  recordId: recordId,
                  title: track.title.trim(),
                  trackNumber: track.trackNumber || null,
                  discNumber: track.discNumber || null,
                  side: track.side || null,
                  durationSeconds: track.durationSeconds || null,
                });
                savedCount++;
              }
            } catch (error) {
              console.warn(`[RecordDetail] Failed to save track:`, error);
            }
          }
          
          // Reload tracks
          const updatedTracks = await getTracksByRecord(recordId);
          setTracks(updatedTracks);
          
          Alert.alert(
            'Success', 
            `Metadata updated! ${savedCount > 0 ? `Added ${savedCount} track${savedCount > 1 ? 's' : ''}. ` : ''}${updates.coverImageRemoteUrl ? 'Cover art added. ' : ''}${updates.year ? 'Year updated. ' : ''}`
          );
        } else if (Object.keys(updates).length > 0) {
          Alert.alert('Success', `Metadata updated! ${updates.coverImageRemoteUrl ? 'Cover art added. ' : ''}${updates.year ? 'Year updated. ' : ''}`);
        } else {
          Alert.alert('Info', 'No additional metadata found for this album.');
        }
        
        // Reload record to show updates
        await load(false);
      } else {
        Alert.alert('Not Found', `Could not find metadata for "${record.title}" by "${record.artist}".`);
      }
    } catch (error: any) {
      console.error('[RecordDetail] Failed to lookup metadata:', error);
      Alert.alert('Error', 'Failed to lookup metadata. Please try again.');
    } finally {
      setFetchingTracks(false);
    }
  };

  const handleFetchTracks = async () => {
    if (!record || !record.coverImageLocalUri) {
      Alert.alert('Error', 'No cover image available to identify tracks.');
      return;
    }

    setFetchingTracks(true);
    try {
      console.log(`[RecordDetail] Fetching tracks for ${record.artist} - ${record.title}`);
      console.log(`[RecordDetail] Image URI: ${record.coverImageLocalUri}`);
      // Don't pass abort signal - let it complete fully
      const response = await identifyRecord(record.coverImageLocalUri);
      
      console.log(`[RecordDetail] Response received:`, {
        hasBestMatch: !!response.bestMatch,
        artist: response.bestMatch?.artist,
        title: response.bestMatch?.title,
        hasTracks: !!response.bestMatch?.tracks,
        tracksCount: response.bestMatch?.tracks?.length || 0,
        tracksArray: JSON.stringify(response.bestMatch?.tracks || []),
      });
      
      if (response.bestMatch.tracks && response.bestMatch.tracks.length > 0) {
        console.log(`[RecordDetail] ✅ Received ${response.bestMatch.tracks.length} tracks from API`);
        console.log(`[RecordDetail] Track list:`, response.bestMatch.tracks.map((t, i) => `${i + 1}. ${t.title}`).join(', '));
        
        // Save tracks to database
        let savedCount = 0;
        let failedCount = 0;
        for (const track of response.bestMatch.tracks) {
          try {
            if (!track.title || !track.title.trim()) {
              console.warn(`[RecordDetail] ⚠️ Skipping track with empty title`);
              continue;
            }
            await createTrack({
              recordId: recordId,
              title: track.title.trim(),
              trackNumber: track.trackNumber ?? undefined,
              discNumber: track.discNumber ?? undefined,
              side: track.side ?? undefined,
              durationSeconds: track.durationSeconds ?? undefined,
            });
            savedCount++;
            console.log(`[RecordDetail] ✅ Saved track ${savedCount}: "${track.title}"`);
          } catch (error) {
            failedCount++;
            console.error(`[RecordDetail] ❌ Failed to save track "${track.title}":`, error);
          }
        }
        
        console.log(`[RecordDetail] Successfully saved ${savedCount}/${response.bestMatch.tracks.length} tracks`);
        if (failedCount > 0) {
          console.warn(`[RecordDetail] ⚠️ Failed to save ${failedCount} tracks`);
        }
        
        // Reload tracks from database
        const updatedTracks = await getTracksByRecord(recordId);
        setTracks(updatedTracks);
        console.log(`[RecordDetail] ✅ Reloaded ${updatedTracks.length} tracks from database`);
        
        if (savedCount > 0) {
          Alert.alert('Success', `Added ${savedCount} track${savedCount > 1 ? 's' : ''} to this album.`);
        } else if (failedCount > 0) {
          Alert.alert('Error', `Found ${response.bestMatch.tracks.length} tracks but could not save them. Please try again.`);
        } else {
          Alert.alert('Info', 'Tracks were found but could not be saved.');
        }
      } else {
        console.warn(`[RecordDetail] ⚠️  No tracks in response!`);
        console.warn(`[RecordDetail] Response structure:`, {
          hasBestMatch: !!response.bestMatch,
          bestMatchKeys: response.bestMatch ? Object.keys(response.bestMatch) : [],
          tracksValue: response.bestMatch?.tracks,
          tracksType: typeof response.bestMatch?.tracks,
          tracksLength: response.bestMatch?.tracks?.length,
          fullResponse: JSON.stringify(response, null, 2),
        });
        Alert.alert(
          'No Tracks Found', 
          'Could not find track information for this album. The backend may not have track data, or the album may not be in Discogs.\n\nYou can add tracks manually by editing the album.'
        );
      }
    } catch (error: any) {
      console.error('[RecordDetail] Failed to fetch tracks:', error);
      Alert.alert(
        'Error',
        error.code === 'LOW_CONFIDENCE' && error.candidates
          ? 'Could not identify album with sufficient confidence. Try editing the album manually.'
          : 'Failed to fetch tracks. Please try again or add tracks manually.'
      );
    } finally {
      setFetchingTracks(false);
    }
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

  // Only show the full-screen spinner before the first successful load
  // Once we've loaded the record at least once, we never show the spinner again
  // (even when navigating back from edit screen)
  if (loading && !hasLoadedOnce) {
    console.log('[RecordDetail] Showing full-screen spinner (first load)', {
      loading,
      hasLoadedOnce,
      hasRecord: !!record,
    });
    return (
      <AppScreen title="Album Details">
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppScreen>
    );
  }
  
  // If we still somehow have no record after loading finished,
  // show a proper "Record not found" message instead of an endless spinner
  // BUT: Only show this if we've never successfully loaded this record before
  // This prevents "not found" when returning from edit screen
  if (!record && !loading && !hasLoadedOnce) {
    console.log('[RecordDetail] Record not found after load completed (never loaded before)');
    return (
      <AppScreen title="Album Details">
        <View style={styles.loadingState}>
          <AppText variant="body">Album not found.</AppText>
        </View>
      </AppScreen>
    );
  }
  
  // CRITICAL: If we have record data, always show the UI
  // This ensures we never show a spinner when navigating back from edit
  // If record is null but we've loaded once, it means we're refreshing - show existing data or wait
  if (!record && hasLoadedOnce) {
    console.log('[RecordDetail] Record temporarily null but hasLoadedOnce=true - showing loading state');
    // Show a minimal loading state while refreshing, but don't show "not found"
    return (
      <AppScreen title="Album Details">
        <View style={styles.loadingState}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md }}>
            Refreshing...
          </AppText>
        </View>
      </AppScreen>
    );
  }

  // If we have record data, proceed to render the album details
  if (!record) {
    // This should only happen if we've never loaded and loading is false
    // (handled by the "not found" check above)
    return null;
  }

  return (
    <>
      <AppScreen title={record.title} subtitle={record.artist}>
        <View style={{ position: 'absolute', top: 16, left: 16, zIndex: 1000 }}>
          <AppIconButton
            name="arrow-back"
            onPress={() => {
              // Always use goBack() - LibraryScreen will restore tab from lastTabBeforeNavigationRef
              // The ref is set before navigation, so it will be available when LibraryScreen comes into focus
              console.log('[RecordDetail] Back button pressed, returnToTab:', returnToTab);
              
              if (navigation.canGoBack()) {
                console.log('[RecordDetail] Using goBack() - LibraryScreen will restore tab from ref');
                navigation.goBack();
              } else {
                console.warn('[RecordDetail] Cannot go back, navigating to LibraryHome');
                // If we can't go back, navigate with returnToTab as fallback
                if (returnToTab) {
                  navigation.navigate('LibraryHome', { returnToTab } as any);
                } else {
                  navigation.navigate('LibraryHome');
                }
              }
            }}
          />
        </View>
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
                {(() => {
                  const { getCoverImageUri } = require('../utils/imageSelection');
                  const imageUri = getCoverImageUri(record.coverImageRemoteUrl, record.coverImageLocalUri);
                  return imageUri ? (
                    <Image
                      source={{ uri: imageUri }}
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
                  );
                })()}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="subtitle">Album Info</AppText>
              <AppIconButton
                name="create-outline"
                onPress={() => navigation.navigate('EditRecord', { recordId: recordId })}
              />
            </View>
            <AppText variant="body">
              <AppText variant="body" style={{ fontWeight: '600' }}>Artist:</AppText> {record.artist}
            </AppText>
            <AppText variant="body">
              <AppText variant="body" style={{ fontWeight: '600' }}>Title:</AppText> {record.title}
            </AppText>
            {record.year && (
              <AppText variant="body">
                <AppText variant="body" style={{ fontWeight: '600' }}>Year:</AppText> {record.year}
              </AppText>
            )}
            {record.genre && (
              <AppText variant="body">
                <AppText variant="body" style={{ fontWeight: '600' }}>Genre:</AppText> {record.genre}
              </AppText>
            )}
          </AppCard>

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
            {/* PR7: Slot Assignment Section */}
            {slotAssignment ? (
              <>
                <AppText variant="body" style={{ marginTop: spacing.sm, fontWeight: '600' }}>
                  Slot Assignment
                </AppText>
                <AppText variant="body">
                  Unit: {slotAssignment.unit.name}
                </AppText>
                <AppText variant="body">
                  Slot: {slotAssignment.slot.slotNumber}
                </AppText>
                <AppButton
                  title="View Virtual Shelf"
                  variant="secondary"
                  onPress={() => {
                    navigation.navigate('VirtualShelf', {
                      unitId: slotAssignment.unit.id,
                      recordId: recordId,
                    });
                  }}
                />
              </>
            ) : location ? (
              <>
                <AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.sm }}>
                  No slot assignment yet. Use Virtual Shelf to assign a specific slot.
                </AppText>
                <AppButton
                  title="Open Virtual Shelf"
                  variant="secondary"
                  onPress={() => {
                    if (location.unitId) {
                      navigation.navigate('VirtualShelf', {
                        unitId: location.unitId,
                        recordId: recordId,
                      });
                    } else {
                      Alert.alert('Error', 'Unit ID not available');
                    }
                  }}
                />
              </>
            ) : null}
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
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.xs }}>
              <AppText variant="subtitle">Tracks</AppText>
              <View style={{ flexDirection: 'row', gap: spacing.xs }}>
                {/* Lookup Metadata button - works for CSV imports without cover art */}
                {(!record.coverImageRemoteUrl || tracks.length === 0) && record.artist && record.title && (
                  <AppButton
                    title={fetchingTracks ? "Looking up..." : "Lookup Metadata"}
                    variant="secondary"
                    onPress={handleLookupMetadata}
                    disabled={fetchingTracks}
                    style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                  />
                )}
                {/* Fetch Tracks button - only if we have cover image */}
                {tracks.length === 0 && record.coverImageLocalUri && (
                  <AppButton
                    title={fetchingTracks ? "Fetching..." : "Fetch Tracks"}
                    variant="secondary"
                    onPress={handleFetchTracks}
                    disabled={fetchingTracks}
                    style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
                  />
                )}
              </View>
            </View>
            {fetchingTracks ? (
              <View style={{ padding: spacing.md, alignItems: 'center' }}>
                <ActivityIndicator size="small" color={colors.accent} />
                <AppText variant="caption" style={{ color: colors.textSecondary, marginTop: spacing.xs }}>
                  Fetching track list...
                </AppText>
              </View>
            ) : tracks.length === 0 ? (
              <AppText variant="caption" style={{ color: colors.textSecondary }}>
                No tracks added yet. Tracks can be populated automatically from the identification service or added manually.
              </AppText>
            ) : (
              <View style={{ gap: spacing.xs }}>
                {tracks.map((track, idx) => (
                  <View
                    key={track.id}
                    style={{
                      padding: spacing.sm,
                      backgroundColor: colors.backgroundMuted,
                      borderRadius: radius.sm,
                    }}
                  >
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flex: 1 }}>
                      <AppText variant="body" style={{ flex: 1 }}>
                        {track.trackNumber ? `${track.trackNumber}. ` : `${idx + 1}. `}
                        {track.title}
                      </AppText>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        {track.bpm && (
                          <AppText variant="caption" style={{ color: colors.accent, fontWeight: '600' }}>
                            {Math.round(track.bpm)} BPM
                          </AppText>
                        )}
                        <AppText variant="caption" style={{ color: colors.textSecondary }}>
                          {track.durationSeconds 
                            ? `${Math.floor(track.durationSeconds / 60)}:${(track.durationSeconds % 60).toString().padStart(2, '0')}`
                            : '--'
                          }
                        </AppText>
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </AppCard>

          {/* Delete button at bottom - red */}
          <TouchableOpacity
            onPress={handleDelete}
            style={{
              backgroundColor: '#FF3B30',
              paddingVertical: spacing.md,
              paddingHorizontal: spacing.lg,
              borderRadius: radius.md,
              alignItems: 'center',
              marginTop: spacing.lg,
            }}
            activeOpacity={0.8}
          >
            <AppText variant="body" style={{ color: 'white', fontWeight: '600' }}>
              Delete Album
            </AppText>
          </TouchableOpacity>
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

