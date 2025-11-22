import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import {
  getPlacedRecordIds,
  getRecords,
  searchTracksByTitle,
  getRecordsByTrackTitle,
  getAllArtists,
  searchArtists,
  deleteRecord,
} from '../data/repository';
import { RecordModel, Track } from '../data/types';
import { LibraryStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<LibraryStackParamList, 'LibraryHome'>;

type Filter = 'ALL' | 'PLACED' | 'UNPLACED';
type SearchMode = 'ALBUMS' | 'ARTISTS' | 'SONGS';

type SongResult = {
  title: string;
  albumCount: number;
};

type ArtistResult = {
  name: string;
  albumCount: number;
};

export const LibraryScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [records, setRecords] = useState<RecordModel[]>([]);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('PLACED');
  const [searchMode, setSearchMode] = useState<SearchMode>('ALBUMS');
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([]);
  const [allArtists, setAllArtists] = useState<string[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsList, placementSet, artistsList] = await Promise.all([
        getRecords(),
        getPlacedRecordIds(),
        getAllArtists(),
      ]);
      setRecords(recordsList);
      setPlacedIds(placementSet);
      setAllArtists(artistsList);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Fuzzy search helper - calculates Levenshtein distance
  const levenshteinDistance = (str1: string, str2: string): number => {
    const matrix: number[][] = [];
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    return matrix[str2.length][str1.length];
  };

  // Get fuzzy suggestions based on similarity
  const getFuzzySuggestions = (query: string, items: string[], maxDistance: number = 2): string[] => {
    if (!query.trim()) return [];
    const lowerQuery = query.toLowerCase();
    const suggestions: Array<{ item: string; distance: number }> = [];
    
    items.forEach(item => {
      const lowerItem = item.toLowerCase();
      if (lowerItem.includes(lowerQuery)) {
        suggestions.push({ item, distance: 0 });
      } else {
        const distance = levenshteinDistance(lowerQuery, lowerItem);
        if (distance <= maxDistance && distance < lowerQuery.length) {
          suggestions.push({ item, distance });
        }
      }
    });
    
    return suggestions
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 5)
      .map(s => s.item);
  };

  const filteredRecords = useMemo(() => {
    const lower = query.toLowerCase();
    return records.filter((record) => {
      const matchesQuery =
        record.title.toLowerCase().includes(lower) ||
        record.artist.toLowerCase().includes(lower);
      if (!matchesQuery) return false;

      const isPlaced = placedIds.has(record.id);
      if (filter === 'PLACED') return isPlaced;
      if (filter === 'UNPLACED') return !isPlaced;
      return true;
    });
  }, [records, query, filter, placedIds]);

  useEffect(() => {
    const performSearch = async () => {
      if (!query.trim()) {
        setSongResults([]);
        setArtistResults([]);
        return;
      }

      setLoading(true);
      try {
        // Always search all three, regardless of active tab
        // Songs search
        const tracks = await searchTracksByTitle(query);
        const grouped = tracks.reduce<Record<string, Set<string>>>((acc, track) => {
          if (!acc[track.title]) {
            acc[track.title] = new Set();
          }
          acc[track.title].add(track.recordId);
          return acc;
        }, {});

        const songResults: SongResult[] = Object.entries(grouped).map(([title, recordIds]) => ({
          title,
          albumCount: recordIds.size,
        }));
        setSongResults(songResults);

        // Artists search
        const artists = await searchArtists(query);
        const artistCounts = artists.map(artist => {
          const count = records.filter(r => r.artist === artist).length;
          return { name: artist, albumCount: count };
        });
        setArtistResults(artistCounts);
      } catch (error) {
        console.error('Search failed', error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [query, records]);

  const RecordItem: React.FC<{ item: RecordModel }> = ({ item }) => {
    const placed = placedIds.has(item.id);
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
        onStartShouldSetPanResponder: () => !showDeleteButton,
        onMoveShouldSetPanResponder: (_, gestureState) => {
          return Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10;
        },
        onPanResponderMove: (_, gestureState) => {
          if (showDeleteButton) {
            if (gestureState.dx > 0) {
              swipeAnim.setValue(gestureState.dx - 80);
            }
          } else {
            if (gestureState.dx < 0) {
              swipeAnim.setValue(gestureState.dx);
            }
          }
        },
        onPanResponderRelease: (_, gestureState) => {
          const swipeThreshold = -80;
          
          if (showDeleteButton) {
            if (gestureState.dx > 50) {
              resetSwipe();
            } else {
              Animated.spring(swipeAnim, {
                toValue: -80,
                useNativeDriver: true,
              }).start();
            }
          } else {
            if (gestureState.dx < swipeThreshold) {
              Animated.spring(swipeAnim, {
                toValue: -80,
                useNativeDriver: true,
              }).start();
              setShowDeleteButton(true);
            } else {
              resetSwipe();
            }
          }
        },
      })
    ).current;

    const handleDelete = () => {
      Alert.alert(
        'Delete Album',
        `Are you sure you want to delete "${item.artist} - ${item.title}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: resetSwipe },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteRecord(item.id);
                refresh();
              } catch (error) {
                console.error('Failed to delete record', error);
                Alert.alert('Error', 'Could not delete record.');
              }
            },
          },
        ]
      );
    };

    return (
      <View style={{ position: 'relative', overflow: 'hidden', marginBottom: spacing.md }}>
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
            <TouchableOpacity
              onPress={() =>
                navigation.navigate('RecordDetail', { recordId: item.id })
              }
              activeOpacity={0.9}
              style={[
                styles.recordCard,
                {
                  backgroundColor: colors.surfaceAlt,
                  borderColor: colors.borderSubtle,
                  borderRadius: radius.md,
                },
              ]}
            >
              {item.coverImageRemoteUrl || item.coverImageLocalUri ? (
                <Image
                  source={{ 
                    uri: item.coverImageRemoteUrl || item.coverImageLocalUri || ''
                  }}
                  style={styles.coverArt}
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
                    color: placed ? colors.accent : colors.textMuted,
                  }}
                >
                  {placed ? 'Placed' : 'Not placed yet'}
                </AppText>
              </View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
        
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
    );
  };

  const renderRecord = ({ item }: { item: RecordModel }) => {
    return <RecordItem item={item} />;
  };

  const renderEmpty = () => {
    if (loading) {
      return (
        <View style={styles.emptyState}>
          <ActivityIndicator color={colors.accent} />
          <AppText variant="caption" style={{ marginTop: 8 }}>
            Loading records…
          </AppText>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <AppText variant="subtitle">No records yet</AppText>
        <AppText variant="body" style={{ marginTop: 8, textAlign: 'center' }}>
          Tap the cyan + button to add your first album or import it later via
          CSV.
        </AppText>
      </View>
    );
  };

  const openAddOptions = () => setAddModalVisible(true);
  const closeAddOptions = () => setAddModalVisible(false);

  const handleScanOption = () => {
    closeAddOptions();
    navigation.navigate('ScanRecord');
  };

  const handleManualOption = () => {
    closeAddOptions();
    navigation.navigate('AddRecord', {});
  };

  const filterOptions: { label: string; value: Filter }[] = [
    { label: 'Placed', value: 'PLACED' },
    { label: 'All', value: 'ALL' },
    { label: 'Unplaced', value: 'UNPLACED' },
  ];

  return (
    <>
      <AppScreen
        title="SlotSync Library"
        subtitle="Browse, search, and manage your collection."
        scroll={false}
      >
        <View style={{ gap: spacing.lg, flex: 1 }}>
          <View style={styles.modeToggle}>
            <TouchableOpacity
              onPress={() => setSearchMode('ALBUMS')}
              style={[
                styles.modeButton,
                {
                  backgroundColor:
                    searchMode === 'ALBUMS' ? colors.accent : 'transparent',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <AppText
                variant="caption"
                style={{
                  color:
                    searchMode === 'ALBUMS' ? colors.background : colors.textPrimary,
                }}
              >
                Albums
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSearchMode('ARTISTS')}
              style={[
                styles.modeButton,
                {
                  backgroundColor:
                    searchMode === 'ARTISTS' ? colors.accent : 'transparent',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <AppText
                variant="caption"
                style={{
                  color:
                    searchMode === 'ARTISTS' ? colors.background : colors.textPrimary,
                }}
              >
                Artists
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setSearchMode('SONGS')}
              style={[
                styles.modeButton,
                {
                  backgroundColor:
                    searchMode === 'SONGS' ? colors.accent : 'transparent',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <AppText
                variant="caption"
                style={{
                  color:
                    searchMode === 'SONGS' ? colors.background : colors.textPrimary,
                }}
              >
                Songs
              </AppText>
            </TouchableOpacity>
          </View>

          <View
            style={[
              styles.searchBar,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.md,
              },
            ]}
          >
            <TextInput
              placeholder="Search albums, artists, or songs"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              style={[styles.input, { color: colors.textPrimary }]}
            />
            {query.trim() && filteredRecords.length === 0 && searchMode === 'ALBUMS' && (
              <View style={{ marginTop: spacing.sm }}>
                {(() => {
                  const suggestions = getFuzzySuggestions(query, [
                    ...records.map(r => r.title),
                    ...records.map(r => r.artist),
                  ]);
                  if (suggestions.length > 0) {
                    return (
                      <View>
                        <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.xs }}>
                          Did you mean?
                        </AppText>
                        {suggestions.slice(0, 3).map((suggestion, idx) => (
                          <TouchableOpacity
                            key={idx}
                            onPress={() => setQuery(suggestion)}
                            style={{ paddingVertical: spacing.xs }}
                          >
                            <AppText variant="body" style={{ color: colors.accent }}>
                              {suggestion}
                            </AppText>
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  }
                  return null;
                })()}
              </View>
            )}
          </View>

          {searchMode === 'ALBUMS' && (
            <View style={styles.filterRow}>
            {filterOptions.map((option) => {
              const active = filter === option.value;
              return (
                <TouchableOpacity
                  key={option.value}
                  onPress={() => setFilter(option.value)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.accent : 'transparent',
                      borderColor: active
                        ? colors.accent
                        : colors.borderSubtle,
                    },
                  ]}
                >
                  <AppText
                    variant="caption"
                    style={{
                      color: active ? colors.background : colors.textPrimary,
                    }}
                  >
                    {option.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
          )}

          {searchMode === 'ALBUMS' ? (
            <FlatList
              data={filteredRecords}
              keyExtractor={(item) => item.id}
              renderItem={renderRecord}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: 120 }}
              style={{ flex: 1 }}
            />
          ) : searchMode === 'ARTISTS' ? (
            <FlatList
              data={artistResults}
              keyExtractor={(item) => item.name}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => {
                    // Navigate to filtered albums by artist
                    setSearchMode('ALBUMS');
                    setQuery(item.name);
                  }}
                  style={[
                    styles.recordCard,
                    {
                      backgroundColor: colors.surfaceAlt,
                      borderColor: colors.borderSubtle,
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="subtitle">{item.name}</AppText>
                    <AppText
                      variant="caption"
                      style={{ marginTop: 4, color: colors.textSecondary }}
                    >
                      {item.albumCount} album{item.albumCount === 1 ? '' : 's'} in collection
                    </AppText>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: 120 }}
              style={{ flex: 1 }}
            />
          ) : (
            <FlatList
              data={songResults}
              keyExtractor={(item) => item.title}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate('SongDetail', { trackTitle: item.title })
                  }
                  style={[
                    styles.recordCard,
                    {
                      backgroundColor: colors.surfaceAlt,
                      borderColor: colors.borderSubtle,
                      borderRadius: radius.md,
                    },
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <AppText variant="subtitle">{item.title}</AppText>
                    <AppText
                      variant="caption"
                      style={{ marginTop: 4, color: colors.textSecondary }}
                    >
                      {item.albumCount} album{item.albumCount === 1 ? '' : 's'} in collection
                    </AppText>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={renderEmpty}
              contentContainerStyle={{ gap: spacing.md, paddingBottom: 120 }}
              style={{ flex: 1 }}
            />
          )}
        </View>
      </AppScreen>

      <TouchableOpacity
        activeOpacity={0.9}
        onPress={openAddOptions}
        style={[
          styles.fab,
          { backgroundColor: colors.accent, shadowColor: colors.accent },
        ]}
      >
        <AppText
          variant="subtitle"
          style={{ color: colors.background, textAlign: 'center' }}
        >
          +
        </AppText>
      </TouchableOpacity>

      <Modal visible={addModalVisible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
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
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Add Record
            </AppText>
            <AppButton title="Scan cover (recommended)" onPress={handleScanOption} />
            <AppButton
              title="Enter manually"
              variant="secondary"
              style={{ marginTop: spacing.sm }}
              onPress={handleManualOption}
            />
            <AppButton
              title="Cancel"
              variant="ghost"
              style={{ marginTop: spacing.sm }}
              onPress={closeAddOptions}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
};

const styles = StyleSheet.create({
  deleteButton: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 80,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  modeToggle: {
    flexDirection: 'row',
    gap: 8,
    borderWidth: 1,
    borderRadius: 8,
    padding: 2,
  },
  modeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: 'center',
    borderWidth: 1,
  },
  searchBar: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  input: {
    fontSize: 16,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
  },
  recordCard: {
    flexDirection: 'row',
    padding: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  coverArt: {
    width: 64,
    height: 64,
    borderRadius: 8,
  },
  coverPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 110,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
    zIndex: 999,
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  modalCard: {
    width: '100%',
    borderWidth: 1,
    padding: 24,
    gap: 12,
  },
});
