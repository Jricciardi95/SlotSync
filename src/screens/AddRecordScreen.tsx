import React, { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  TextInput,
  View,
  Image,
  TouchableOpacity,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppButton } from '../components/AppButton';
import { AppText } from '../components/AppText';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { createRecord, createTrack } from '../data/repository';
import { LibraryStackParamList } from '../navigation/types';
import { convertToJpeg } from '../utils/imageConverter';
import { getApiUrl } from '../config/api';
import { ActivityIndicator } from 'react-native';

type Props = NativeStackScreenProps<LibraryStackParamList, 'AddRecord'>;

export const AddRecordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing, radius } = useTheme();
  const { 
    imageUri, 
    initialArtist, 
    initialTitle, 
    initialYear,
    identifiedImageUrl 
  } = route.params || {};
  const [title, setTitle] = useState(initialTitle || '');
  const [artist, setArtist] = useState(initialArtist || '');
  const [artistLastName, setArtistLastName] = useState('');
  const [year, setYear] = useState(initialYear ? String(initialYear) : '');
  const [notes, setNotes] = useState('');
  // CRITICAL: Prioritize identified image URL over original photo
  // This ensures we use the professional cover art when available
  const [coverUri, setCoverUri] = useState<string | null>(
    identifiedImageUrl || imageUri || null
  );
  const [saving, setSaving] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);
  const [tracks, setTracks] = useState<Array<{ title: string; trackNumber?: number | null }>>([]);

  useEffect(() => {
    // CRITICAL: If we have an identified image URL (from batch review), use it directly
    // No need to convert remote URLs - they're already optimized
    if (identifiedImageUrl) {
      setCoverUri(identifiedImageUrl);
      return;
    }
    
    // Otherwise, convert local image to JPEG if needed (HEIC → JPEG)
    if (imageUri) {
      convertToJpeg(imageUri, {
        maxWidth: 1200,
        quality: 0.8,
      }).then((jpegUri) => {
        setCoverUri(jpegUri);
      }).catch((error) => {
        console.error('[AddRecord] Failed to convert incoming image:', error);
        // Fallback to original
        setCoverUri(imageUri);
      });
    }
  }, [imageUri, identifiedImageUrl]);

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow photo access to attach cover art.'
      );
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 1.0, // Get full quality, we'll compress in conversion
    });
    if (!result.canceled && result.assets?.length) {
      // CRITICAL: Convert to JPEG (HEIC → JPEG)
      console.log('[AddRecord] Converting selected image to JPEG...');
      const jpegUri = await convertToJpeg(result.assets[0].uri, {
        maxWidth: 1200,
        quality: 0.8,
      });
      console.log('[AddRecord] ✅ Image converted to JPEG');
      setCoverUri(jpegUri);
    }
  };

  const handleLookupMetadata = async () => {
    if (!artist.trim() || !title.trim()) {
      Alert.alert('Missing info', 'Please enter both artist and album title to lookup metadata.');
      return;
    }

    setLookingUp(true);
    try {
      console.log(`[AddRecord] Looking up metadata for "${artist}" - "${title}"`);
      const { identifyRecordByText } = await import('../services/RecordIdentificationService');
      const response = await identifyRecordByText(artist.trim(), title.trim());
      
      if (response.bestMatch) {
        const match = response.bestMatch;
        
        // Update form fields with canonical values
        if (match.artist) setArtist(match.artist);
        if (match.title) setTitle(match.title);
        if (match.year) setYear(String(match.year));
        
        // CRITICAL: Always use HQ cover art from API, never user photo
        // Set cover image if available (always from API)
        if (match.coverImageRemoteUrl) {
          setCoverUri(match.coverImageRemoteUrl);
        }
        
        // Set tracks
        if (match.tracks && match.tracks.length > 0) {
          setTracks(match.tracks.map((t: any) => ({
            title: t.title,
            trackNumber: t.trackNumber || null,
          })));
        }
        
        Alert.alert('Success', `Found metadata: ${match.tracks?.length || 0} tracks, ${match.coverImageRemoteUrl ? 'HQ cover art' : 'no cover art'}`);
      } else {
        Alert.alert('Not Found', `Could not find metadata for "${title}" by "${artist}". You can still save manually.`);
      }
    } catch (error) {
      console.error('[AddRecord] Lookup error:', error);
      Alert.alert('Lookup Failed', 'Could not fetch metadata. Please try again or save manually.');
    } finally {
      setLookingUp(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim() || !artist.trim()) {
      Alert.alert('Missing info', 'Title and artist are required.');
      return;
    }
    setSaving(true);
    try {
      // CRITICAL: Use unified image selection logic
      // Priority: identifiedImageUrl (from lookup) > coverUri (if HTTP) > coverUri (local)
      // If metadata lookup returned a coverImageRemoteUrl, use it and ignore user photo
      const { prepareImageFields } = require('../utils/imageSelection');
      
      // Determine remote URL: identifiedImageUrl takes precedence, then HTTP URLs from coverUri
      const remoteUrl = identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? coverUri : null);
      // Local URI: only if coverUri is not an HTTP URL (i.e., it's a local file)
      const localUri = (coverUri && !coverUri.startsWith('http')) ? coverUri : null;
      
      const imageFields = prepareImageFields(remoteUrl, localUri);
      
      // PR3: createRecord now returns { record, isNew } and handles duplicates
      const { record: newRecord, isNew } = await createRecord({
        title: title.trim(),
        artist: artist.trim(),
        artistLastName: artistLastName.trim() || null,
        year: year ? Number(year) : null,
        notes: notes.trim() || null,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
        coverImageLocalUri: imageFields.coverImageLocalUri,
      });
      
      // PR3: Show conflict UI if record already exists
      if (!isNew) {
        Alert.alert(
          'Record Already Exists',
          `"${newRecord.artist} - ${newRecord.title}" is already in your library.`,
          [
            {
              text: 'Open Existing',
              onPress: () => {
                navigation.navigate('RecordDetail', { recordId: newRecord.id });
              },
            },
            {
              text: 'OK',
              style: 'cancel',
            },
          ]
        );
        return; // Exit early - don't create tracks for existing record
      }
      
      // Create tracks if we have them (only for new records)
      if (tracks.length > 0 && newRecord.id) {
        for (const track of tracks) {
          try {
            await createTrack({
              recordId: newRecord.id,
              title: track.title,
              trackNumber: track.trackNumber || null,
            });
          } catch (trackError) {
            console.warn('[AddRecord] Failed to create track:', trackError);
          }
        }
      }
      
      console.log('[AddRecord] Record saved successfully:', {
        id: newRecord.id,
        artist: newRecord.artist,
        title: newRecord.title,
        tracksCount: tracks.length,
      });
      
      // Navigate back - library will refresh via useFocusEffect
      navigation.goBack();
    } catch (error) {
      Alert.alert('Save failed', 'Please try again.');
      console.log(error);
    } finally {
      setSaving(false);
    }
  };

  const editImage = async () => {
    if (!coverUri) {
      pickImage();
      return;
    }

    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow photo access to edit cover art.'
      );
      return;
    }
    
    // Allow editing/cropping of existing image
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1], // Square aspect ratio for album covers
      quality: 1.0, // Get full quality, we'll compress in conversion
    });
    
    if (!result.canceled && result.assets?.length) {
      // CRITICAL: Convert to JPEG (HEIC → JPEG)
      console.log('[AddRecord] Converting edited image to JPEG...');
      const jpegUri = await convertToJpeg(result.assets[0].uri, {
        maxWidth: 1200,
        quality: 0.8,
      });
      console.log('[AddRecord] ✅ Image converted to JPEG');
      setCoverUri(jpegUri);
    }
  };

  const styles = createStyles(spacing, colors, radius);

  return (
    <AppScreen title="Add Record">
      <View style={{ position: 'absolute', top: spacing.lg, left: spacing.lg, zIndex: 1000 }}>
        <AppIconButton
          name="arrow-back"
          onPress={() => navigation.goBack()}
        />
      </View>
      <AppCard style={{ gap: spacing.md }}>
        <TouchableOpacity
          style={[
            styles.coverPicker,
            {
              borderColor: colors.borderSubtle,
              backgroundColor: colors.backgroundMuted,
            },
          ]}
          onPress={editImage}
        >
          {coverUri ? (
            <>
              <Image source={{ uri: coverUri }} style={styles.coverImage} />
              <View style={[styles.editOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                <AppText variant="caption" style={{ color: 'white' }}>
                  Tap to crop/edit
                </AppText>
              </View>
            </>
          ) : (
            <AppText variant="caption">Tap to add cover image</AppText>
          )}
        </TouchableOpacity>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Title*</AppText>
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="Album title"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Artist*</AppText>
          <TextInput
            value={artist}
            onChangeText={setArtist}
            placeholder="Artist name"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Artist Last Name</AppText>
          <TextInput
            value={artistLastName}
            onChangeText={setArtistLastName}
            placeholder="For sorting"
            placeholderTextColor={colors.textMuted}
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Year</AppText>
          <TextInput
            value={year}
            onChangeText={setYear}
            placeholder="e.g. 1977"
            placeholderTextColor={colors.textMuted}
            keyboardType="numeric"
            style={[styles.input, { color: colors.textPrimary, borderColor: colors.borderSubtle }]}
          />
        </View>

        <View style={styles.fieldGroup}>
          <AppText variant="caption">Notes</AppText>
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Pressing info, purchase notes..."
            placeholderTextColor={colors.textMuted}
            multiline
            style={[
              styles.input,
              styles.notesInput,
              { color: colors.textPrimary, borderColor: colors.borderSubtle },
            ]}
          />
        </View>

        {/* Lookup Metadata Button */}
        {artist.trim() && title.trim() && (
          <AppButton
            title={lookingUp ? "Looking up..." : "Lookup Metadata"}
            variant="secondary"
            onPress={handleLookupMetadata}
            disabled={lookingUp || saving}
            style={{ marginBottom: spacing.sm }}
          />
        )}

        {/* Tracks Display (if found via lookup) */}
        {tracks.length > 0 && (
          <View style={styles.fieldGroup}>
            <AppText variant="caption">Tracks ({tracks.length})</AppText>
            <View style={[styles.tracksList, { borderColor: colors.borderSubtle }]}>
              {tracks.map((track, index) => (
                <AppText key={index} variant="body" style={{ marginBottom: spacing.xs }}>
                  {track.trackNumber ? `${track.trackNumber}. ` : ''}{track.title}
                </AppText>
              ))}
            </View>
          </View>
        )}

        <AppButton title="Save Record" onPress={handleSave} disabled={saving || lookingUp} />
      </AppCard>
    </AppScreen>
  );
};

// Create styles function to use theme values at runtime
const createStyles = (
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number; xxl: number },
  colors: any,
  radius: { sm: number; md: number; lg: number; pill: number }
) => StyleSheet.create({
  coverPicker: {
    width: '100%',
    aspectRatio: 1,
    borderWidth: 1,
    borderRadius: radius.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.lg,
  },
  editOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomLeftRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
    alignItems: 'center',
  },
  fieldGroup: {
    gap: spacing.xs,
  },
  input: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2, // 10px (sm=8 + 2)
    fontSize: 16,
  },
  notesInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  tracksList: {
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: spacing.sm,
    maxHeight: 200,
  },
});

