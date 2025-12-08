import React, { useCallback, useState, useEffect } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  View,
  TextInput,
  ScrollView,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { useFocusEffect } from '../navigation/useFocusEffect';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import {
  getRecordById,
  getTracksByRecord,
  updateRecord,
  createTrack,
  updateTrack,
  deleteTrack,
} from '../data/repository';
import { RecordModel, Track } from '../data/types';
import { LibraryStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<LibraryStackParamList, 'EditRecord'>;

export const EditRecordScreen: React.FC<Props> = ({ route, navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const { recordId } = route.params;

  // CRITICAL: Guard against missing recordId in route params
  // Use useEffect to navigate (can't call navigation during render)
  useEffect(() => {
    if (!recordId) {
      console.error('[EditRecord] Missing recordId in route params, navigating back');
      // Navigate back if we can, otherwise go to LibraryHome
      if (navigation.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('LibraryHome');
      }
    }
  }, [recordId, navigation]);

  // Show error UI if recordId is missing (instead of returning null during render)
  if (!recordId) {
    return (
      <AppScreen title="Edit Album" scroll={false}>
        <AppCard>
          <AppText variant="body">Invalid album ID. Please try again.</AppText>
        </AppCard>
      </AppScreen>
    );
  }

  const [record, setRecord] = useState<RecordModel | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [year, setYear] = useState('');
  const [genre, setGenre] = useState('');
  const [trackTitles, setTrackTitles] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [recordData, tracksData] = await Promise.all([
        getRecordById(recordId),
        getTracksByRecord(recordId),
      ]);
      
      if (recordData) {
        setRecord(recordData);
        setArtist(recordData.artist || '');
        setTitle(recordData.title || '');
        setYear(recordData.year?.toString() || '');
        setGenre(recordData.genre || '');
      }
      
      setTracks(tracksData);
      setTrackTitles(tracksData.map(t => t.title));
    } finally {
      setLoading(false);
    }
  }, [recordId]);

  useFocusEffect(
    useCallback(() => {
      console.log('[EditRecord] useFocusEffect triggered, loading record', recordId);
      load();
    }, [load, recordId])
  );

  const handleSave = async () => {
    console.log('[EditFlow] Save pressed for album', recordId);
    if (!artist.trim() || !title.trim()) {
      Alert.alert('Error', 'Artist and title are required.');
      return;
    }

    setSaving(true);
    try {
      // Update record
      await updateRecord(recordId, {
        artist: artist.trim(),
        title: title.trim(),
        year: year.trim() ? parseInt(year.trim()) : null,
        genre: genre.trim() || null,
      });

      // Update tracks
      const existingTrackIds = tracks.map(t => t.id);
      
      // Delete tracks that were removed
      for (const track of tracks) {
        if (!trackTitles.includes(track.title)) {
          await deleteTrack(track.id);
        }
      }

      // Update or create tracks
      for (let i = 0; i < trackTitles.length; i++) {
        const trackTitle = trackTitles[i].trim();
        if (!trackTitle) continue;

        const existingTrack = tracks.find(t => t.title === trackTitle);
        if (existingTrack) {
          // Update track number if changed
          if (existingTrack.trackNumber !== i + 1) {
            await updateTrack(existingTrack.id, {
              trackNumber: i + 1,
            });
          }
        } else {
          // Create new track
          await createTrack({
            recordId,
            title: trackTitle,
            trackNumber: i + 1,
          });
        }
      }

      // Success - use goBack() to return to the previous screen (RecordDetailScreen)
      // This maintains the correct navigation stack: ListScreen → RecordDetailScreen → EditRecordScreen → (back) RecordDetailScreen
      console.log('[EditFlow] Save completed, going back to detail screen');
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        // Fallback: if we can't go back, navigate to detail screen
        // This should rarely happen, but prevents getting stuck
        console.warn('[EditFlow] Cannot go back, navigating to RecordDetail');
        navigation.navigate('RecordDetail', { recordId });
      }
    } catch (error) {
      console.error('Failed to save record:', error);
      Alert.alert('Error', 'Could not save changes.');
    } finally {
      // CRITICAL: Always ensure saving state is cleared
      // This happens after navigation, but ensures state is clean if navigation fails
      setSaving(false);
    }
  };

  const handleAddTrack = () => {
    setTrackTitles([...trackTitles, '']);
  };

  const handleRemoveTrack = (index: number) => {
    const newTracks = trackTitles.filter((_, i) => i !== index);
    setTrackTitles(newTracks);
  };

  const handleTrackTitleChange = (index: number, value: string) => {
    const newTracks = [...trackTitles];
    newTracks[index] = value;
    setTrackTitles(newTracks);
  };

  // Full-screen spinner for EditRecordScreen, controlled by loading state
  if (loading && !record) {
    console.log('[Spinner] EditRecordScreen loading - initial load');
    return (
      <AppScreen title="Edit Album" scroll={false}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  if (!record && !loading) {
    return (
      <AppScreen title="Edit Album" scroll={false}>
        <AppCard>
          <AppText variant="body">Record not found.</AppText>
        </AppCard>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Edit Album" scroll={true}>
      {saving && (
        <View style={[styles.savingOverlay, { backgroundColor: colors.background }]}>
          <ActivityIndicator size="large" color={colors.accent} />
          <AppText variant="body" style={{ marginTop: spacing.md, color: colors.textPrimary }}>
            Saving...
          </AppText>
        </View>
      )}
      <AppCard style={{ gap: spacing.md, opacity: saving ? 0.3 : 1 }}>
        <AppText variant="subtitle">Basic Information</AppText>
        
        <View style={{ gap: spacing.sm }}>
          <View>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Artist *
            </AppText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: colors.borderSubtle,
                  color: '#000000',
                },
              ]}
              value={artist}
              onChangeText={setArtist}
              placeholder="Artist name"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Album Title *
            </AppText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: colors.borderSubtle,
                  color: '#000000',
                },
              ]}
              value={title}
              onChangeText={setTitle}
              placeholder="Album title"
              placeholderTextColor={colors.textMuted}
            />
          </View>

          <View>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Year
            </AppText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: colors.borderSubtle,
                  color: '#000000',
                },
              ]}
              value={year}
              onChangeText={setYear}
              placeholder="Year"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
            />
          </View>

          <View>
            <AppText variant="caption" style={{ marginBottom: spacing.xs }}>
              Genre
            </AppText>
            <TextInput
              style={[
                styles.input,
                {
                  backgroundColor: '#FFFFFF',
                  borderColor: colors.borderSubtle,
                  color: '#000000',
                },
              ]}
              value={genre}
              onChangeText={setGenre}
              placeholder="Genre (e.g., Rock, Jazz, Classical)"
              placeholderTextColor={colors.textMuted}
            />
          </View>
        </View>
      </AppCard>

      <AppCard style={{ gap: spacing.md }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <AppText variant="subtitle">Tracks</AppText>
          <AppButton
            title="Add Track"
            variant="secondary"
            onPress={handleAddTrack}
            style={{ paddingHorizontal: spacing.md, paddingVertical: spacing.xs }}
          />
        </View>

        <View style={{ gap: spacing.sm }}>
          {trackTitles.length === 0 ? (
            <AppText variant="caption" style={{ color: colors.textSecondary }}>
              No tracks. Tap "Add Track" to add songs.
            </AppText>
          ) : (
            trackTitles.map((trackTitle, index) => (
              <View
                key={index}
                style={{
                  flexDirection: 'row',
                  gap: spacing.sm,
                  alignItems: 'center',
                }}
              >
                <AppText variant="body" style={{ minWidth: 30 }}>
                  {index + 1}.
                </AppText>
                <TextInput
                  style={[
                    styles.trackInput,
                    {
                      backgroundColor: '#FFFFFF',
                      borderColor: colors.borderSubtle,
                      color: '#000000',
                      flex: 1,
                    },
                  ]}
                  value={trackTitle}
                  onChangeText={(value) => handleTrackTitleChange(index, value)}
                  placeholder={`Track ${index + 1} title`}
                  placeholderTextColor={colors.textMuted}
                />
                <AppIconButton
                  name="trash-outline"
                  onPress={() => handleRemoveTrack(index)}
                />
              </View>
            ))
          )}
        </View>
      </AppCard>

      <View style={{ gap: spacing.md, marginTop: spacing.lg, marginBottom: spacing.xl }}>
        <AppButton
          title="Save Changes"
          onPress={handleSave}
          disabled={saving || !artist.trim() || !title.trim()}
        />
        <AppButton
          title="Cancel"
          variant="secondary"
          onPress={() => {
            // Cancel - use goBack() to return to the previous screen (RecordDetailScreen)
            console.log('[EditFlow] Cancel pressed, going back');
            if (navigation.canGoBack()) {
              navigation.goBack();
            } else {
              // Fallback: if we can't go back, navigate to detail screen
              console.warn('[EditFlow] Cannot go back, navigating to RecordDetail');
              navigation.navigate('RecordDetail', { recordId });
            }
          }}
          disabled={saving}
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
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  trackInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

