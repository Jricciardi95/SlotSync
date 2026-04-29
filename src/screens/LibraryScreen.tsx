import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  ActivityIndicator,
  FlatList,
  SectionList,
  Image,
  Modal,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ScrollView,
  Keyboard,
} from 'react-native';
import { RecordRow } from '../components/RecordRow';
import { debounce } from '../utils/debounce';
import { logger } from '../utils/logger';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { FastScrollHandle, useFastScrollHandle } from '../components/FastScrollHandle';
import { PlaylistSelectionModal } from '../components/PlaylistSelectionModal';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import {
  getPlacedRecordIds,
  getRecords,
  searchTracksByTitle,
  getRecordsByTrackTitle,
  getAllArtists,
  searchArtists,
  deleteRecord,
  getPlaylists,
  deletePlaylist,
  createPlaylist,
  updatePlaylist,
  getPlaylistRecords,
  getPlaylistItems,
  getTrackById,
} from '../data/repository';
import { RecordModel, Track, Playlist, PlaylistRecord } from '../data/types';
import { PlaylistItemWithDetails } from '../data/repository';
import { LibraryStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';

type Props = NativeStackScreenProps<LibraryStackParamList, 'LibraryHome'>;

type Filter = 'ALL' | 'PLACED' | 'UNPLACED' | 'PLAYLISTS';
type SearchMode = 'ALBUMS' | 'ARTISTS' | 'SONGS' | 'ALL';

type SongResult = {
  title: string;
  albumCount: number;
  trackId?: string; // First track ID for this song title (for adding to playlists)
};

type ArtistResult = {
  name: string;
  albumCount: number;
};

// Section data type for alphabetical grouping
type Section<T> = {
  title: string;
  data: T[];
};

// Get first letter of a string (for alphabetical grouping)
const getFirstLetter = (str: string): string => {
  if (!str || str.length === 0) return '#';
  const firstChar = str.trim().charAt(0).toUpperCase();
  return /[A-Z]/.test(firstChar) ? firstChar : '#';
};

// Group items alphabetically by first letter
const groupAlphabetically = <T,>(
  items: T[],
  getKey: (item: T) => string
): Section<T>[] => {
  const grouped: { [key: string]: T[] } = {};
  
  items.forEach(item => {
    const key = getKey(item);
    const letter = getFirstLetter(key);
    if (!grouped[letter]) {
      grouped[letter] = [];
    }
    grouped[letter].push(item);
  });
  
  // Sort items within each group
  Object.keys(grouped).forEach(letter => {
    grouped[letter].sort((a, b) => {
      const aKey = getKey(a).toLowerCase();
      const bKey = getKey(b).toLowerCase();
      return aKey.localeCompare(bKey);
    });
  });
  
  // Convert to array and sort sections
  const sections: Section<T>[] = Object.keys(grouped)
    .sort((a, b) => {
      if (a === '#') return 1;
      if (b === '#') return -1;
      return a.localeCompare(b);
    })
    .map(letter => ({
      title: letter,
      data: grouped[letter],
    }));
  
  return sections;
};

export const LibraryScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing, radius } = useTheme();
  const [records, setRecords] = useState<RecordModel[]>([]);
  const [placedIds, setPlacedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('ALL');
  const [searchMode, setSearchMode] = useState<SearchMode>('ALBUMS');
  
  // PR4: Debounce search input (200ms delay)
  useEffect(() => {
    const debounced = debounce((value: string) => {
      setDebouncedQuery(value);
    }, 200);
    
    debounced(query);
    
    return () => {
      // Cleanup on unmount
    };
  }, [query]);
  const [songResults, setSongResults] = useState<SongResult[]>([]);
  const [artistResults, setArtistResults] = useState<ArtistResult[]>([]);
  const [allArtists, setAllArtists] = useState<string[]>([]);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchInputRef = useRef<TextInput>(null);
  // Store the last tab before navigation to RecordDetail
  // This ensures we can restore it even if params don't work
  const lastTabBeforeNavigationRef = useRef<SearchMode | null>(null);
  // Track if we're intentionally switching tabs (don't restore during intentional switches)
  const isIntentionalTabSwitchRef = useRef(false);
  // Refs for SectionList to enable scroll-to-section
  const albumsListRef = useRef<SectionList<RecordModel>>(null);
  const artistsListRef = useRef<SectionList<ArtistResult>>(null);
  const songsListRef = useRef<SectionList<SongResult>>(null);
  // Playlist selection modal state
  const [playlistModalVisible, setPlaylistModalVisible] = useState(false);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null);
  // Action sheet state
  const [actionSheetVisible, setActionSheetVisible] = useState(false);
  const [actionSheetRecordId, setActionSheetRecordId] = useState<string | null>(null);
  const [actionSheetTrackId, setActionSheetTrackId] = useState<string | null>(null);
  // Playlist edit/create modal state
  const [playlistEditModalVisible, setPlaylistEditModalVisible] = useState(false);
  const [editingPlaylist, setEditingPlaylist] = useState<Playlist | null>(null);
  const [playlistName, setPlaylistName] = useState('');
  const [playlistDescription, setPlaylistDescription] = useState('');
  const [playlistDetailVisible, setPlaylistDetailVisible] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [recordsList, placementSet, artistsList, playlistsList] = await Promise.all([
        getRecords(),
        getPlacedRecordIds(),
        getAllArtists(),
        getPlaylists(),
      ]);
      setRecords(recordsList);
      setPlacedIds(placementSet);
      setAllArtists(artistsList);
      setPlaylists(playlistsList);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to restore tab from ref or params
  // Priority: ref (most reliable when using goBack) > params
  const restoreTab = useCallback(() => {
    // CRITICAL: Don't restore if we're in the middle of an intentional tab switch
    if (isIntentionalTabSwitchRef.current) {
      return false;
    }
    
    const refTab = lastTabBeforeNavigationRef.current;
    const returnToTab = route.params?.returnToTab;
    // Priority: ref > params (ref is more reliable when using goBack())
    const tabToRestore = refTab || returnToTab;
    
    if (tabToRestore && ['ALBUMS', 'ARTISTS', 'SONGS', 'ALL'].includes(tabToRestore)) {
      // Always restore if we have a tab to restore, even if it matches current mode
      // This ensures the tab is correct after navigation
      if (tabToRestore !== searchMode) {
        setSearchMode(tabToRestore as SearchMode);
      }
      // Clear the ref after a delay to ensure restoration is complete
      setTimeout(() => {
        lastTabBeforeNavigationRef.current = null;
      }, 500); // Increased delay to ensure state is fully updated
      // Clear params if they exist
      if (returnToTab) {
        setTimeout(() => {
          navigation.setParams({ returnToTab: undefined } as any);
        }, 200);
      }
      return true;
    }
    // No tab to restore - this is normal when navigating directly to library
    return false;
  }, [navigation, route.params, searchMode]);

  // Watch for route params changes to restore tab
  useEffect(() => {
    // Use a small delay to ensure params are fully available
    const timeoutId = setTimeout(() => {
      restoreTab();
    }, 50);
    return () => clearTimeout(timeoutId);
  }, [route.params, restoreTab]);

  // Also use navigation listener to catch when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      // Use a delay to ensure params are available after navigation
      const timeoutId = setTimeout(() => {
        restoreTab();
      }, 150);
      return () => clearTimeout(timeoutId);
    });

    return unsubscribe;
  }, [navigation, route.params, restoreTab]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      // CRITICAL: Check for tab restoration when screen comes into focus
      // This is the most reliable way to catch navigation back from RecordDetail
      // Use a delay to ensure the ref is available
      const timeoutId = setTimeout(() => {
        restoreTab();
      }, 200);
      return () => clearTimeout(timeoutId);
    }, [refresh, restoreTab])
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

  // PR4: Use debouncedQuery for filtering to reduce re-renders
  const filteredRecords = useMemo(() => {
    const lower = debouncedQuery.toLowerCase().trim();
    return records.filter((record) => {
      // First apply placement filter
      const isPlaced = placedIds.has(record.id);
      if (filter === 'PLACED' && !isPlaced) return false;
      if (filter === 'UNPLACED' && isPlaced) return false;

      // Then apply query filter (if debouncedQuery exists)
      if (lower) {
        const matchesQuery =
          record.title.toLowerCase().includes(lower) ||
          record.artist.toLowerCase().includes(lower);
        if (!matchesQuery) return false;
      }

      return true;
    });
  }, [records, debouncedQuery, filter, placedIds]);

  // Helper function to filter records by placement
  const getFilteredRecordsByPlacement = useCallback((allRecords: RecordModel[]): RecordModel[] => {
    return allRecords.filter((record) => {
      const isPlaced = placedIds.has(record.id);
      if (filter === 'PLACED' && !isPlaced) return false;
      if (filter === 'UNPLACED' && isPlaced) return false;
      return true; // 'ALL' filter - include all
    });
  }, [filter, placedIds]);

  // Group records alphabetically by title
  const albumsSections = useMemo(() => {
    return groupAlphabetically(filteredRecords, (record) => record.title);
  }, [filteredRecords]);

  // Group artists alphabetically by name
  const artistsSections = useMemo(() => {
    return groupAlphabetically(artistResults, (artist) => artist.name);
  }, [artistResults]);

  // Group songs alphabetically by title
  const songsSections = useMemo(() => {
    return groupAlphabetically(songResults, (song) => song.title);
  }, [songResults]);

  // Scroll to position based on progress (0 to 1)
  const scrollToProgress = useCallback((progress: number) => {
    const sections = 
      searchMode === 'ALBUMS' ? albumsSections :
      searchMode === 'ARTISTS' ? artistsSections :
      songsSections;
    
    const listRef = 
      searchMode === 'ALBUMS' ? albumsListRef :
      searchMode === 'ARTISTS' ? artistsListRef :
      songsListRef;
    
    if (!listRef.current || sections.length === 0) {
      logger.warn('[LibraryScreen] Cannot scroll - no ref or sections');
      return;
    }
    
    // Calculate which section to scroll to based on progress
    // Use Math.round for better accuracy when dragging
    const targetSectionIndex = Math.round(progress * (sections.length - 1));
    const clampedIndex = Math.max(0, Math.min(targetSectionIndex, sections.length - 1));
    
    
    if (listRef.current) {
      try {
        listRef.current.scrollToLocation({
          sectionIndex: clampedIndex,
          itemIndex: 0,
          animated: false, // No animation for smooth dragging
          viewOffset: 0,
        });
      } catch (error) {
        logger.warn('[LibraryScreen] scrollToLocation failed:', error);
      }
    }
  }, [searchMode, albumsSections, artistsSections, songsSections]);

  // Fast scroll handle state (must be after scrollToProgress is defined)
  const albumsFastScroll = useFastScrollHandle(albumsListRef, scrollToProgress);
  const artistsFastScroll = useFastScrollHandle(artistsListRef, scrollToProgress);
  const songsFastScroll = useFastScrollHandle(songsListRef, scrollToProgress);

  const handleDeleteRecord = async (recordId: string) => {
    Alert.alert(
      'Delete Album',
      'Are you sure you want to delete this album? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteRecord(recordId);
              // Refresh the list
              await refresh();
            } catch (error) {
              logger.error('Failed to delete record:', error);
              Alert.alert('Error', 'Could not delete album. Please try again.');
            }
          },
        },
      ]
    );
  };

  // Handle scroll failures gracefully
  const handleScrollToIndexFailed = useCallback((info: { index: number; highestMeasuredFrameIndex: number; averageItemLength: number }) => {
    // Try scrolling to a known position
    const listRef = 
      searchMode === 'ALBUMS' ? albumsListRef :
      searchMode === 'ARTISTS' ? artistsListRef :
      songsListRef;
    
    if (listRef.current) {
      // Scroll to a slightly earlier position to ensure the section is visible
      setTimeout(() => {
        try {
          listRef.current?.scrollToLocation({
            sectionIndex: Math.max(0, info.index - 1),
            itemIndex: 0,
            animated: true,
            viewOffset: 0,
          });
        } catch (error) {
          logger.warn('Fallback scroll also failed:', error);
        }
      }, 100);
    }
  }, [searchMode]);


  useEffect(() => {
    const performSearch = async () => {
      setLoading(true);
      try {
        // Get records filtered by placement (used for songs and artists)
        const placementFilteredRecords = getFilteredRecordsByPlacement(records);
        const placementFilteredRecordIds = new Set(placementFilteredRecords.map(r => r.id));

        if (query.trim()) {
          // Search mode - filter by query
          if (searchMode === 'ALL') {
            // Search across all: albums, artists, and songs
            // Albums are already filtered by filteredRecords (handled by filteredRecords useMemo)
            
            // Search songs - filter by placement
            const tracks = await searchTracksByTitle(query);
            // Only include tracks from albums matching placement filter
            const filteredTracks = tracks.filter(track => placementFilteredRecordIds.has(track.recordId));
            const grouped = filteredTracks.reduce<Record<string, Set<string>>>((acc, track) => {
              if (!acc[track.title]) {
                acc[track.title] = new Set();
              }
              acc[track.title].add(track.recordId);
              return acc;
            }, {});

            const songResults: SongResult[] = await Promise.all(
              Object.entries(grouped).map(async ([title, recordIds]) => {
                // Get the first track with this title for playlist support
                const firstTrack = filteredTracks.find(t => t.title === title);
                return {
                  title,
                  albumCount: recordIds.size,
                  trackId: firstTrack?.id,
                };
              })
            );
            setSongResults(songResults);

            // Search artists - filter by placement
            const artists = await searchArtists(query);
            const artistCounts = artists
              .map(artist => {
                // Only count albums matching placement filter
                const count = placementFilteredRecords.filter(r => r.artist === artist).length;
                return { name: artist, albumCount: count };
              })
              .filter(artist => artist.albumCount > 0); // Only show artists with matching albums
            setArtistResults(artistCounts);
          } else if (searchMode === 'SONGS') {
            // Songs search - filter by placement
            const tracks = await searchTracksByTitle(query);
            // Only include tracks from albums matching placement filter
            const filteredTracks = tracks.filter(track => placementFilteredRecordIds.has(track.recordId));
            const grouped = filteredTracks.reduce<Record<string, Set<string>>>((acc, track) => {
              if (!acc[track.title]) {
                acc[track.title] = new Set();
              }
              acc[track.title].add(track.recordId);
              return acc;
            }, {});

            const songResults: SongResult[] = await Promise.all(
              Object.entries(grouped).map(async ([title, recordIds]) => {
                // Get the first track with this title for playlist support
                const firstTrack = filteredTracks.find(t => t.title === title);
                return {
                  title,
                  albumCount: recordIds.size,
                  trackId: firstTrack?.id,
                };
              })
            );
            setSongResults(songResults);
          } else if (searchMode === 'ARTISTS') {
            // Artists search - filter by placement
            const artists = await searchArtists(query);
            const artistCounts = artists
              .map(artist => {
                // Only count albums matching placement filter
                const count = placementFilteredRecords.filter(r => r.artist === artist).length;
                return { name: artist, albumCount: count };
              })
              .filter(artist => artist.albumCount > 0); // Only show artists with matching albums
            setArtistResults(artistCounts);
          } else {
            // Albums mode - clear other results
            setSongResults([]);
            setArtistResults([]);
          }
        } else {
          // No debouncedQuery - show all based on active tab and placement filter
          if (searchMode === 'ALL') {
            // Show all albums, artists, and songs - filtered by placement
            const allTracks = await searchTracksByTitle('');
            // Only include tracks from albums matching placement filter
            const filteredTracks = allTracks.filter(track => placementFilteredRecordIds.has(track.recordId));
            const grouped = filteredTracks.reduce<Record<string, Set<string>>>((acc, track) => {
              if (!acc[track.title]) {
                acc[track.title] = new Set();
              }
              acc[track.title].add(track.recordId);
              return acc;
            }, {});

            const songResults: SongResult[] = await Promise.all(
              Object.entries(grouped).map(async ([title, recordIds]) => {
                // Get the first track with this title for playlist support
                const firstTrack = filteredTracks.find(t => t.title === title);
                return {
                  title,
                  albumCount: recordIds.size,
                  trackId: firstTrack?.id,
                };
              })
            );
            setSongResults(songResults);

            // Artists - filter by placement
            const allArtists = await getAllArtists();
            const artistCounts = allArtists
              .map(artist => {
                // Only count albums matching placement filter
                const count = placementFilteredRecords.filter(r => r.artist === artist).length;
                return { name: artist, albumCount: count };
              })
              .filter(artist => artist.albumCount > 0); // Only show artists with matching albums
            setArtistResults(artistCounts);
          } else if (searchMode === 'SONGS') {
            // Get all tracks - filter by placement
            const allTracks = await searchTracksByTitle('');
            // Only include tracks from albums matching placement filter
            const filteredTracks = allTracks.filter(track => placementFilteredRecordIds.has(track.recordId));
            const grouped = filteredTracks.reduce<Record<string, Set<string>>>((acc, track) => {
              if (!acc[track.title]) {
                acc[track.title] = new Set();
              }
              acc[track.title].add(track.recordId);
              return acc;
            }, {});

            const songResults: SongResult[] = await Promise.all(
              Object.entries(grouped).map(async ([title, recordIds]) => {
                // Get the first track with this title for playlist support
                const firstTrack = filteredTracks.find(t => t.title === title);
                return {
                  title,
                  albumCount: recordIds.size,
                  trackId: firstTrack?.id,
                };
              })
            );
            setSongResults(songResults);
          } else if (searchMode === 'ARTISTS') {
            // Get all artists - filter by placement
            const allArtists = await getAllArtists();
            const artistCounts = allArtists
              .map(artist => {
                // Only count albums matching placement filter
                const count = placementFilteredRecords.filter(r => r.artist === artist).length;
                return { name: artist, albumCount: count };
              })
              .filter(artist => artist.albumCount > 0); // Only show artists with matching albums
            setArtistResults(artistCounts);
          } else {
            // Albums mode - clear other results
            setSongResults([]);
            setArtistResults([]);
          }
        }
      } catch (error) {
        logger.error('Search failed', error);
      } finally {
        setLoading(false);
      }
    };

    performSearch();
  }, [debouncedQuery, records, searchMode, filter, placedIds, getFilteredRecordsByPlacement]);

  // PR4: Stable callbacks for RecordRow
  const handleRecordPress = useCallback((recordId: string) => {
    // CRITICAL: Always store the current tab when navigating to RecordDetail
    let tabToReturnTo = searchMode;
    
    if (searchMode === 'ALBUMS' && lastTabBeforeNavigationRef.current && lastTabBeforeNavigationRef.current !== 'ALBUMS') {
      tabToReturnTo = lastTabBeforeNavigationRef.current;
    } else {
      lastTabBeforeNavigationRef.current = searchMode;
      tabToReturnTo = searchMode;
    }
    
    navigation.navigate('RecordDetail', { 
      recordId,
      returnToTab: tabToReturnTo,
    });
  }, [navigation, searchMode]);
  
  const handleRecordOptionsPress = useCallback((recordId: string) => {
    setActionSheetRecordId(recordId);
    setActionSheetVisible(true);
  }, []);
  
  // PR4: Memoized render function for records
  const renderRecord = useCallback(({ item }: { item: RecordModel }) => {
    return (
      <RecordRow
        item={item}
        isPlaced={placedIds.has(item.id)}
        onPress={handleRecordPress}
        onOptionsPress={handleRecordOptionsPress}
      />
    );
  }, [placedIds, handleRecordPress, handleRecordOptionsPress]);
  
  // PR4: Stable key extractor
  const keyExtractor = useCallback((item: RecordModel) => item.id, []);
  
  // PR4: getItemLayout for stable heights (estimated: 84px per row including margin)
  const getItemLayout = useCallback((data: any, index: number) => ({
    length: 84,
    offset: 84 * index,
    index,
  }), []);

  // Render section header for alphabetical sections
  const renderSectionHeader = (info: { section: any }) => {
    const section = info.section as Section<any>;
    return (
      <View
        style={{
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
          backgroundColor: colors.backgroundMuted,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderSubtle,
        }}
      >
        <AppText variant="subtitle" style={{ fontSize: 18, fontWeight: '600' }}>
          {section.title}
        </AppText>
      </View>
    );
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
    { label: 'All', value: 'ALL' },
    { label: 'Placed', value: 'PLACED' },
    { label: 'Unplaced', value: 'UNPLACED' },
    { label: 'Playlists', value: 'PLAYLISTS' },
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
            <TouchableOpacity
              onPress={() => setSearchMode('ALL')}
              style={[
                styles.modeButton,
                {
                  backgroundColor:
                    searchMode === 'ALL' ? colors.accent : 'transparent',
                  borderColor: colors.borderSubtle,
                },
              ]}
            >
              <AppText
                variant="caption"
                style={{
                  color:
                    searchMode === 'ALL' ? colors.background : colors.textPrimary,
                }}
              >
                All
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
                flexDirection: 'row',
                alignItems: 'center',
              },
            ]}
          >
            <TextInput
              ref={searchInputRef}
              placeholder="Search albums, artists, or songs"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              onFocus={() => {
                setIsSearchFocused(true);
              }}
              onBlur={() => {
                if (!query.trim()) {
                  setIsSearchFocused(false);
                }
              }}
              onSubmitEditing={() => {
                // Search is triggered automatically by onChangeText
                Keyboard.dismiss();
              }}
              returnKeyType="search"
              blurOnSubmit={true}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  flex: 1,
                  marginRight: isSearchFocused ? spacing.sm : 0,
                },
              ]}
            />
            {isSearchFocused && (
              <TouchableOpacity
                onPress={() => {
                  setQuery('');
                  setIsSearchFocused(false);
                  searchInputRef.current?.blur();
                  Keyboard.dismiss();
                }}
                style={{ padding: spacing.xs }}
              >
                <AppText
                  variant="body"
                  style={{
                    color: colors.accent,
                    fontSize: 16,
                  }}
                >
                  Cancel
                </AppText>
              </TouchableOpacity>
            )}
            {!isSearchFocused && query.trim().length > 0 && (
              <TouchableOpacity
                onPress={() => setQuery('')}
                style={{ padding: spacing.xs }}
              >
                <Ionicons name="close-circle" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>
          
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
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <AppButton
              title="Closer Look"
              variant="secondary"
              onPress={() => navigation.navigate('CloserLook')}
            />
          </View>

          {filter === 'PLAYLISTS' ? (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 120 }}
            >
              <View style={{ padding: spacing.md, gap: spacing.md }}>
                {/* Create Playlist Button */}
                <TouchableOpacity
                  onPress={() => {
                    setEditingPlaylist(null);
                    setPlaylistName('');
                    setPlaylistDescription('');
                    setPlaylistEditModalVisible(true);
                  }}
                  style={[
                    styles.recordCard,
                    {
                      backgroundColor: colors.accent,
                      borderColor: colors.accent,
                      borderRadius: radius.md,
                      padding: spacing.md,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                    },
                  ]}
                >
                  <Ionicons name="add" size={24} color={colors.background} />
                  <AppText
                    variant="subtitle"
                    style={{ marginLeft: spacing.sm, color: colors.background }}
                  >
                    Create New Playlist
                  </AppText>
                </TouchableOpacity>

                {/* Playlists List */}
                {playlists.length === 0 ? (
                  <View style={styles.emptyState}>
                    <AppText variant="subtitle">No playlists yet</AppText>
                    <AppText variant="body" style={{ marginTop: 8, textAlign: 'center' }}>
                      Tap "Create New Playlist" above to get started.
                    </AppText>
                  </View>
                ) : (
                  playlists.map((playlist) => (
                    <TouchableOpacity
                      key={playlist.id}
                      onPress={async () => {
                        setSelectedPlaylistId(playlist.id);
                        setPlaylistDetailVisible(true);
                      }}
                      style={[
                        styles.recordCard,
                        {
                          backgroundColor: colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                          borderRadius: radius.md,
                          padding: spacing.md,
                        },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <AppText variant="subtitle">{playlist.name}</AppText>
                        {playlist.description && (
                          <AppText
                            variant="caption"
                            style={{ marginTop: 4, color: colors.textSecondary }}
                          >
                            {playlist.description}
                          </AppText>
                        )}
                      </View>
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          setEditingPlaylist(playlist);
                          setPlaylistName(playlist.name);
                          setPlaylistDescription(playlist.description || '');
                          setPlaylistEditModalVisible(true);
                        }}
                        style={{ padding: spacing.sm }}
                      >
                        <Ionicons name="create-outline" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))
                )}
              </View>
            </ScrollView>
          ) : searchMode === 'ALBUMS' ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <SectionList
                ref={albumsListRef}
                sections={albumsSections}
                keyExtractor={(item) => item.id}
                renderItem={renderRecord}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={{ paddingBottom: 120 }}
                style={{ flex: 1 }}
                stickySectionHeadersEnabled={true}
                onScrollToIndexFailed={handleScrollToIndexFailed}
                onScroll={(event) => {
                  // Update fast scroll handle
                  albumsFastScroll.handleScroll(event);
                }}
                scrollEventThrottle={16}
              />
              {/* Fast Scroll Handle */}
              <FastScrollHandle
                listRef={albumsListRef}
                scrollPosition={albumsFastScroll.scrollProgress}
                onScroll={scrollToProgress}
                visible={albumsFastScroll.isScrolling}
              />
            </View>
          ) : searchMode === 'ALL' ? (
            <View style={{ flex: 1 }}>
              {/* PR4: Use FlatList for albums section instead of ScrollView + map */}
              {filteredRecords.length > 0 && (
                <View>
                  <AppText variant="subtitle" style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.md }}>
                    Albums ({filteredRecords.length})
                  </AppText>
                  <FlatList
                    data={filteredRecords}
                    keyExtractor={keyExtractor}
                    renderItem={({ item }) => (
                      <View style={{ paddingHorizontal: spacing.md, marginBottom: spacing.sm }}>
                        <RecordRow
                          item={item}
                          isPlaced={placedIds.has(item.id)}
                          onPress={handleRecordPress}
                          onOptionsPress={handleRecordOptionsPress}
                        />
                      </View>
                    )}
                    contentContainerStyle={{ paddingBottom: 120 }}
                    // PR4: Performance optimizations
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={10}
                    removeClippedSubviews={true}
                    getItemLayout={getItemLayout}
                  />
                </View>
              )}

              {/* PR4: Use FlatList for artists section */}
              {artistResults.length > 0 && (
                <View>
                  <AppText variant="subtitle" style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.md }}>
                    Artists ({artistResults.length})
                  </AppText>
                  <FlatList
                    data={artistResults}
                    keyExtractor={(item) => item.name}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        onPress={() => {
                          // When clicking artist from ALL tab, switch to ALBUMS to show their albums
                          // Store ALL in ref so we can return to it when navigating back from album
                          // Mark this as an intentional tab switch so restoreTab doesn't interfere
                          if (searchMode === 'ALL') {
                            isIntentionalTabSwitchRef.current = true;
                            lastTabBeforeNavigationRef.current = 'ALL';
                            setSearchMode('ALBUMS');
                            setTimeout(() => {
                              isIntentionalTabSwitchRef.current = false;
                            }, 500);
                          }
                          setQuery(item.name);
                        }}
                        style={[
                          styles.recordCard,
                          {
                            backgroundColor: colors.surfaceAlt,
                            borderColor: colors.borderSubtle,
                            borderRadius: radius.md,
                            marginHorizontal: spacing.md,
                            marginBottom: spacing.sm,
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
                    contentContainerStyle={{ paddingBottom: 120 }}
                    // PR4: Performance optimizations
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={10}
                    removeClippedSubviews={true}
                  />
                </View>
              )}

              {/* PR4: Use FlatList for songs section */}
              {songResults.length > 0 && (
                <View>
                  <AppText variant="subtitle" style={{ marginBottom: spacing.sm, paddingHorizontal: spacing.md, marginTop: spacing.md }}>
                    Songs ({songResults.length})
                  </AppText>
                  <FlatList
                    data={songResults}
                    keyExtractor={(item) => item.title}
                    renderItem={({ item }) => (
                    <TouchableOpacity
                      onPress={() => {
                        // Store current tab (SONGS or ALL) before navigating to SongDetail
                        // This ensures we can return to the correct tab when navigating back from album
                        const tabToStore = searchMode;
                        lastTabBeforeNavigationRef.current = tabToStore;
                        navigation.navigate('SongDetail', { 
                          trackTitle: item.title,
                          returnToTab: tabToStore, // Pass the tab so SongDetail can use it
                        } as any);
                      }}
                      style={[
                        styles.recordCard,
                        {
                          backgroundColor: colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                          borderRadius: radius.md,
                          marginHorizontal: spacing.md,
                          marginBottom: spacing.sm,
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
                    contentContainerStyle={{ paddingBottom: 120 }}
                    // PR4: Performance optimizations
                    initialNumToRender={10}
                    maxToRenderPerBatch={10}
                    windowSize={10}
                    removeClippedSubviews={true}
                  />
                </View>
              )}

              {/* Empty State */}
              {filteredRecords.length === 0 && artistResults.length === 0 && songResults.length === 0 && (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <AppText variant="body" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                    No results found for "{debouncedQuery}"
                  </AppText>
                </View>
              )}
            </View>
          ) : searchMode === 'ARTISTS' ? (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <SectionList
                ref={artistsListRef}
                sections={artistsSections}
                keyExtractor={(item) => item.name}
                renderItem={({ item }) => {
                  const handleOptionsPress = () => {
                    // For artists, we can't add to playlist (only albums)
                    Alert.alert(
                      'Delete Artist',
                      `Are you sure you want to delete all albums by "${item.name}"? This action cannot be undone.`,
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Delete',
                          style: 'destructive',
                          onPress: async () => {
                            try {
                              const artistRecords = records.filter(r => r.artist === item.name);
                              for (const record of artistRecords) {
                                await deleteRecord(record.id);
                              }
                              await refresh();
                            } catch (error) {
                              logger.error('Failed to delete artist records:', error);
                              Alert.alert('Error', 'Could not delete albums. Please try again.');
                            }
                          },
                        },
                      ]
                    );
                  };

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        // When clicking artist from ARTISTS tab, switch to ALBUMS to show their albums
                        isIntentionalTabSwitchRef.current = true;
                        lastTabBeforeNavigationRef.current = 'ARTISTS';
                        setSearchMode('ALBUMS');
                        setQuery(item.name);
                        setTimeout(() => {
                          isIntentionalTabSwitchRef.current = false;
                        }, 500);
                      }}
                      activeOpacity={0.9}
                      style={[
                        styles.recordCard,
                        {
                          backgroundColor: colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                          borderRadius: radius.md,
                          marginHorizontal: spacing.md,
                          marginBottom: spacing.sm,
                          padding: spacing.md,
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
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleOptionsPress();
                        }}
                        style={{ padding: spacing.sm }}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={{ paddingBottom: 120 }}
                style={{ flex: 1 }}
                stickySectionHeadersEnabled={true}
                onScrollToIndexFailed={handleScrollToIndexFailed}
                onScroll={(event) => {
                  // Update fast scroll handle
                  artistsFastScroll.handleScroll(event);
                }}
                scrollEventThrottle={16}
              />
              {/* Fast Scroll Handle */}
              <FastScrollHandle
                listRef={artistsListRef}
                scrollPosition={artistsFastScroll.scrollProgress}
                onScroll={scrollToProgress}
                visible={artistsFastScroll.isScrolling}
              />
            </View>
          ) : (
            <View style={{ flex: 1, flexDirection: 'row' }}>
              <SectionList
                ref={songsListRef}
                sections={songsSections}
                keyExtractor={(item) => item.title}
                renderItem={({ item }) => {
                  const handleOptionsPress = () => {
                    if (item.trackId) {
                      setActionSheetTrackId(item.trackId);
                      setActionSheetRecordId(null);
                      setActionSheetVisible(true);
                    } else {
                      Alert.alert('Error', 'Could not find track ID for this song.');
                    }
                  };

                  return (
                    <TouchableOpacity
                      onPress={() => {
                        const tabToStore = searchMode;
                        lastTabBeforeNavigationRef.current = tabToStore;
                        navigation.navigate('SongDetail', { 
                          trackTitle: item.title,
                          returnToTab: tabToStore,
                        } as any);
                      }}
                      activeOpacity={0.9}
                      style={[
                        styles.recordCard,
                        {
                          backgroundColor: colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                          borderRadius: radius.md,
                          marginHorizontal: spacing.md,
                          marginBottom: spacing.sm,
                          padding: spacing.md,
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
                      <TouchableOpacity
                        onPress={(e) => {
                          e.stopPropagation();
                          handleOptionsPress();
                        }}
                        style={{ padding: spacing.sm }}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
                renderSectionHeader={renderSectionHeader}
                ListEmptyComponent={renderEmpty}
                contentContainerStyle={{ paddingBottom: 120 }}
                style={{ flex: 1 }}
                stickySectionHeadersEnabled={true}
                onScrollToIndexFailed={handleScrollToIndexFailed}
                onScroll={(event) => {
                  // Update fast scroll handle
                  songsFastScroll.handleScroll(event);
                }}
                scrollEventThrottle={16}
              />
              {/* Fast Scroll Handle */}
              <FastScrollHandle
                listRef={songsListRef}
                scrollPosition={songsFastScroll.scrollProgress}
                onScroll={scrollToProgress}
                visible={songsFastScroll.isScrolling}
              />
            </View>
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

      {/* Action Sheet Modal */}
      <Modal visible={actionSheetVisible} transparent animationType="fade">
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setActionSheetVisible(false)}
        >
          <View
            style={[
              styles.actionSheet,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.lg,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => {
                setActionSheetVisible(false);
                if (actionSheetRecordId) {
                  setSelectedRecordId(actionSheetRecordId);
                  setSelectedTrackId(null);
                  setPlaylistModalVisible(true);
                } else if (actionSheetTrackId) {
                  setSelectedTrackId(actionSheetTrackId);
                  setSelectedRecordId(null);
                  setPlaylistModalVisible(true);
                }
              }}
              style={[
                styles.actionSheetItem,
                {
                  borderBottomColor: colors.borderSubtle,
                },
              ]}
            >
              <Ionicons name="list" size={20} color={colors.textPrimary} />
              <AppText variant="body" style={{ marginLeft: spacing.md }}>
                Add to a playlist
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setActionSheetVisible(false);
                if (actionSheetRecordId) {
                  handleDeleteRecord(actionSheetRecordId);
                } else if (actionSheetTrackId) {
                  Alert.alert('Info', 'Track deletion from albums is not yet fully implemented. Please delete tracks from individual albums.');
                }
              }}
              style={styles.actionSheetItem}
            >
              <Ionicons name="trash" size={20} color="#FF3B30" />
              <AppText variant="body" style={{ marginLeft: spacing.md, color: '#FF3B30' }}>
                Delete from library
              </AppText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActionSheetVisible(false)}
              style={[styles.actionSheetItem, { marginTop: spacing.sm }]}
            >
              <AppText variant="body" style={{ textAlign: 'center', color: colors.textSecondary }}>
                Cancel
              </AppText>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Playlist Selection Modal */}
      {(selectedRecordId !== null || selectedTrackId !== null) && (
        <PlaylistSelectionModal
          visible={playlistModalVisible}
          recordId={selectedRecordId || undefined}
          trackId={selectedTrackId || undefined}
          onClose={() => {
            setPlaylistModalVisible(false);
            setSelectedRecordId(null);
            setSelectedTrackId(null);
          }}
          onAdded={() => {
            refresh();
          }}
        />
      )}

      {/* Playlist Create/Edit Modal */}
      <Modal visible={playlistEditModalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() => {
              setPlaylistEditModalVisible(false);
              setEditingPlaylist(null);
              setPlaylistName('');
              setPlaylistDescription('');
            }}
          >
            <View />
          </TouchableOpacity>
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
              {editingPlaylist ? 'Edit Playlist' : 'Create Playlist'}
            </AppText>
            <TextInput
              placeholder="Playlist name"
              placeholderTextColor={colors.textMuted}
              value={playlistName}
              onChangeText={setPlaylistName}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.surfaceAlt,
                },
              ]}
              autoFocus={!editingPlaylist}
            />
            <TextInput
              placeholder="Description (optional)"
              placeholderTextColor={colors.textMuted}
              value={playlistDescription}
              onChangeText={setPlaylistDescription}
              multiline
              numberOfLines={3}
              style={[
                styles.input,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderSubtle,
                  backgroundColor: colors.surfaceAlt,
                  minHeight: 80,
                  textAlignVertical: 'top',
                  marginTop: spacing.sm,
                },
              ]}
            />
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md }}>
              <AppButton
                title="Cancel"
                variant="ghost"
                onPress={() => {
                  setPlaylistEditModalVisible(false);
                  setEditingPlaylist(null);
                  setPlaylistName('');
                  setPlaylistDescription('');
                }}
                style={{ flex: 1 }}
              />
              <AppButton
                title={editingPlaylist ? 'Save' : 'Create'}
                onPress={async () => {
                  if (!playlistName.trim()) {
                    Alert.alert('Error', 'Please enter a playlist name.');
                    return;
                  }
                  try {
                    if (editingPlaylist) {
                      await updatePlaylist(editingPlaylist.id, playlistName.trim(), playlistDescription.trim());
                      Alert.alert('Success', 'Playlist updated!');
                    } else {
                      await createPlaylist(playlistName.trim(), playlistDescription.trim());
                      Alert.alert('Success', 'Playlist created!');
                    }
                    setPlaylistEditModalVisible(false);
                    setEditingPlaylist(null);
                    setPlaylistName('');
                    setPlaylistDescription('');
                    await refresh();
                  } catch (error) {
                    logger.error('Failed to save playlist:', error);
                    Alert.alert('Error', 'Could not save playlist.');
                  }
                }}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Playlist Detail Modal */}
      <Modal visible={playlistDetailVisible} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
                borderRadius: radius.lg,
                maxHeight: '80%',
              },
            ]}
          >
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.md }}>
              <AppText variant="subtitle">
                {playlists.find(p => p.id === selectedPlaylistId)?.name || 'Playlist'}
              </AppText>
              <TouchableOpacity onPress={() => setPlaylistDetailVisible(false)}>
                <Ionicons name="close" size={24} color={colors.textPrimary} />
              </TouchableOpacity>
            </View>
            <PlaylistDetailContent playlistId={selectedPlaylistId} />
          </View>
        </View>
      </Modal>
    </>
  );
};

// Playlist Detail Content Component
const PlaylistDetailContent: React.FC<{ playlistId: string | null }> = ({ playlistId }) => {
  const { colors, spacing, radius } = useTheme();
  const [playlistItems, setPlaylistItems] = useState<PlaylistItemWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (playlistId) {
      loadPlaylistItems();
    }
  }, [playlistId]);

  const loadPlaylistItems = async () => {
    if (!playlistId) return;
    setLoading(true);
    try {
      const items = await getPlaylistItems(playlistId);
      setPlaylistItems(items);
    } catch (error) {
      logger.error('Failed to load playlist items:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!playlistId) return null;

  if (loading) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (playlistItems.length === 0) {
    return (
      <View style={{ padding: spacing.xl, alignItems: 'center' }}>
        <AppText variant="body" style={{ color: colors.textSecondary }}>
          This playlist is empty
        </AppText>
      </View>
    );
  }

  return (
    <ScrollView style={{ maxHeight: 500 }}>
      {playlistItems.map((item) => (
        <View
          key={item.id}
          style={[
            {
              backgroundColor: colors.surfaceAlt,
              borderColor: colors.borderSubtle,
              borderRadius: radius.md,
              padding: spacing.md,
              marginBottom: spacing.sm,
            },
          ]}
        >
          {item.itemType === 'record' && item.record ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="disc" size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                <AppText variant="subtitle">{item.record.title}</AppText>
              </View>
              <AppText variant="body" style={{ color: colors.textSecondary }}>
                {item.record.artist}
              </AppText>
            </>
          ) : item.itemType === 'track' && item.track ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="musical-notes" size={16} color={colors.textSecondary} style={{ marginRight: spacing.xs }} />
                <AppText variant="subtitle">{item.track.title}</AppText>
              </View>
              <AppText variant="caption" style={{ color: colors.textSecondary }}>
                Song
              </AppText>
            </>
          ) : null}
        </View>
      ))}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
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
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
    padding: 16,
  },
  actionSheet: {
    width: '100%',
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  actionSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
  },
});
