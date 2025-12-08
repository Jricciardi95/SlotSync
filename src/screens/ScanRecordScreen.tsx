import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
  Image,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import {
  identifyRecord,
  identifyRecordByBarcode,
  IdentificationMatch,
  IdentificationError,
  normalizeScanResult,
  ScanResult,
} from '../services/RecordIdentificationService';
import { convertToJpeg } from '../utils/imageConverter';
import { createRecord, findDuplicateRecord, createTrack, saveImageHash } from '../data/repository';
import { generateImageHash } from '../utils/imageHash';
import { Ionicons } from '@expo/vector-icons';
import { AppIconButton } from '../components/AppIconButton';

type Props = NativeStackScreenProps<LibraryStackParamList, 'ScanRecord'>;

export const ScanRecordScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing, radius } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [identifying, setIdentifying] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<IdentificationMatch | null>(null);
  const [suggestions, setSuggestions] = useState<{
    albumSuggestions?: Array<{
      artist: string;
      albumTitle: string;
      releaseYear?: number;
      discogsId: string;
      confidence: number;
      source?: string;
    }>;
    candidates?: IdentificationMatch[]; // Legacy - deprecated
    extractedText?: string; // Debug only - not shown to user
  } | null>(null);
  const [scanMode, setScanMode] = useState<'image' | 'barcode'>('image'); // NEW: Barcode scanning mode
  const [saving, setSaving] = useState(false); // CRITICAL: Prevent duplicate saves
  const savingRef = useRef(false); // CRITICAL: Ref-based guard to prevent race conditions
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<CameraView | null>(null);

  // SAFETY: Reset savingRef if it's stuck (e.g., from a crash or navigation)
  useEffect(() => {
    // If saving state is false but ref is true, reset the ref
    if (!saving && savingRef.current) {
      console.warn('[ScanRecord] ⚠️ Detected stuck savingRef, resetting...');
      savingRef.current = false;
    }
  }, [saving]);
  useEffect(() => {
    if (scanning) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(scanLineAnim, {
            toValue: 1,
            duration: 2000,
            useNativeDriver: true,
          }),
          Animated.timing(scanLineAnim, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanning]);

  // DEBUG: Log whenever result state changes
  useEffect(() => {
    console.log('[ScanRecord] 🔍 Result state changed:', {
      hasResult: !!result,
      hasCurrent: !!result?.current,
      currentArtist: result?.current?.artist,
      currentTitle: result?.current?.title,
      alternatesCount: result?.alternates?.length || 0,
    });
  }, [result]);

  // DEBUG: Log whenever saving state changes
  useEffect(() => {
    console.log('[ScanRecord] 💾 Saving state changed:', {
      saving,
      savingRef: savingRef.current,
    });
  }, [saving]);

  if (!permission) {
    return (
      <AppScreen title="Camera">
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  if (!permission.granted) {
    return (
      <AppScreen title="Camera Permission">
        <AppCard>
          <AppText variant="body" style={{ marginBottom: spacing.md }}>
            We need camera access to scan album covers.
          </AppText>
          <AppButton title="Grant Permission" onPress={requestPermission} />
        </AppCard>
      </AppScreen>
    );
  }

  const handleCancel = () => {
    // Cancel any ongoing identification request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    // Reset state
    setCapturedUri(null);
    setResult(null);
    setSelectedSuggestion(null);
    setIdentifying(false);
    setScanning(true);
  };

  const handleManualCapture = async () => {
    if (capturing || capturedUri) return;

    setCapturing(true);
    setScanning(false);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Try to use CameraView's takePictureAsync if available
      let photoUri: string | null = null;
      
      if (cameraRef.current) {
        try {
          // Try to call takePictureAsync on the camera ref
          const camera = cameraRef.current as any;
          if (camera.takePictureAsync) {
            const photo = await camera.takePictureAsync({
              quality: 1.0, // Maximum quality for better OCR/recognition
              base64: false,
              skipProcessing: false, // Keep image processing for better results
              exif: false, // Don't need EXIF data
            });
            photoUri = photo?.uri || null;
          }
        } catch (err) {
          console.log('CameraView takePictureAsync not available, using ImagePicker fallback');
        }
      }

      // Fallback to ImagePicker if CameraView method didn't work
      if (!photoUri) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          throw new Error('Camera permission not granted');
        }

        const result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsEditing: false,
          quality: 1.0, // Maximum quality for better OCR/recognition
          exif: false, // Don't need EXIF data
        });

        if (!result.canceled && result.assets?.[0]?.uri) {
          photoUri = result.assets[0].uri;
        }
      }

      if (photoUri) {
        // CRITICAL: Convert to JPEG before processing (HEIC → JPEG)
        console.log('[ScanRecord] Converting captured image to JPEG...');
        const jpegUri = await convertToJpeg(photoUri, {
          maxWidth: 1200,
          quality: 0.8,
        });
        console.log('[ScanRecord] ✅ Image converted to JPEG, using:', jpegUri);
        await handleCapture(jpegUri);
      } else {
        // No image captured - reset
        setScanning(true);
      }
    } catch (error) {
      console.error('Capture failed', error);
      // Reset on error
      setScanning(true);
    } finally {
      setCapturing(false);
    }
  };

  const handleCapture = async (uri: string) => {
    setCapturedUri(uri);
    setScanning(false);
    setIdentifying(true);

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const response = await identifyRecord(uri, abortControllerRef.current.signal);
      console.log('[ScanRecord] Identification response:', {
        artist: response.bestMatch.artist,
        title: response.bestMatch.title,
        year: response.bestMatch.year,
        tracksCount: response.bestMatch.tracks?.length || 0,
        tracks: response.bestMatch.tracks,
        confidence: response.confidence,
        hasTracks: !!response.bestMatch.tracks,
        tracksArray: JSON.stringify(response.bestMatch.tracks || []),
      });
      
      if (!response.bestMatch.tracks || response.bestMatch.tracks.length === 0) {
        console.warn('[ScanRecord] ⚠️ No tracks in response!');
        console.warn('[ScanRecord] Full response.bestMatch:', JSON.stringify(response.bestMatch, null, 2));
      } else {
        console.log(`[ScanRecord] ✅ Received ${response.bestMatch.tracks.length} tracks from API`);
        console.log('[ScanRecord] First track sample:', response.bestMatch.tracks[0]);
      }
      // Normalize response into ScanResult structure
      const normalizedResult = normalizeScanResult(response);
      setResult(normalizedResult);
      abortControllerRef.current = null;
    } catch (error: any) {
      // Don't show error if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        setIdentifying(false);
        return;
      }
      
      // CRITICAL: Treat LOW_CONFIDENCE with candidates as suggestions, not a hard error
      // This should open the Review Suggestions UI without scary red console errors
      if (error.code === 'LOW_CONFIDENCE') {
        const candidates = Array.isArray(error.candidates) ? error.candidates : [];
        
        // CRITICAL: Only show suggestions if we have valid album candidates
        // Backend should already filter, but be defensive - only use items with non-empty title
        const validCandidates = candidates.filter((c: any) => {
          return c && c.title && typeof c.title === 'string' && c.title.trim().length > 0;
        });
        
        // Check for albumSuggestions from backend (canonical Discogs releases)
        const albumSuggestions = (error as any).albumSuggestions || (error as any).discogsSuggestions || [];
        if (albumSuggestions.length > 0) {
          // Soft path: show suggestions UI with canonical album suggestions only
          console.log(`[ScanRecord] Low confidence with ${albumSuggestions.length} canonical album suggestions - showing suggestions screen`);
          setSuggestions({
            albumSuggestions: albumSuggestions,
            extractedText: error.extractedText, // Keep for debug only, not shown to user
          });
          setIdentifying(false);
          return;
        }
        
        // Fallback: if no albumSuggestions but we have valid candidates, try to use them
        // (This should rarely happen if backend is working correctly)
        if (validCandidates.length > 0) {
          console.log(`[ScanRecord] Low confidence with ${validCandidates.length} candidates but no albumSuggestions - showing suggestions screen`);
          setSuggestions({
            albumSuggestions: validCandidates.map((c: any) => ({
              artist: c.artist,
              albumTitle: c.title,
              discogsId: c.discogsId || null,
              releaseYear: c.year || null,
              confidence: c.confidence || 0.5,
            })),
            extractedText: error.extractedText,
          });
          setIdentifying(false);
          return;
        }
        
        // No valid album candidates: skip suggestions UI and go straight to manual entry
        console.log(`[ScanRecord] Low confidence but no valid album candidates - showing manual entry prompt`);
        setIdentifying(false);
        Alert.alert(
          'Unable to Identify Record',
          'We couldn\'t identify this album with confidence. Would you like to enter the details manually?',
          [
            { 
              text: 'No', 
              style: 'cancel', 
              onPress: () => handleCancel()
            },
            {
              text: 'Yes',
              onPress: () => {
                navigation.navigate('AddRecord', { 
                  imageUri: uri || undefined,
                  initialArtist: error.extractedText?.split(' ')[0] || undefined,
                  initialTitle: error.extractedText?.split(' ').slice(1).join(' ') || undefined,
                });
              },
            },
          ]
        );
        return;
      }
      
      // Hard errors: log and show error UI
      console.error('[ScanRecord] Identification failed:', error);
      console.error('[ScanRecord] Error details:', {
        code: error.code,
        message: error.message,
        hasCandidates: !!error.candidates,
        candidatesCount: error.candidates?.length || 0,
        hasExtractedText: !!error.extractedText,
      });
      
      // Check if we have any extracted text or candidates to show (fallback for non-LOW_CONFIDENCE errors)
      if (error.extractedText || (error.candidates && error.candidates.length > 0)) {
        const candidates = error.candidates || [];
        if (candidates.length > 0) {
          console.log(`[ScanRecord] Found ${candidates.length} candidates from error - showing suggestions`);
          setSuggestions({
            candidates: candidates,
            extractedText: error.extractedText,
          });
          setIdentifying(false);
          return;
        }
      }
      
      // Show clear error message based on error type
      let errorTitle = 'Unable to Identify Record';
      let errorMessage = error.message || 'Unknown error occurred';
      
      // Provide user-friendly error messages
      switch (error.code) {
        case 'NETWORK_ERROR':
          errorTitle = 'Connection Error';
          errorMessage = 'Could not connect to the identification service. Please check your internet connection and try again.';
          break;
        case 'TIMEOUT':
          errorTitle = 'Request Timeout';
          errorMessage = 'The identification request took too long. Please try again with a clearer image.';
          break;
        case 'INVALID_IMAGE':
          errorTitle = 'Invalid Image';
          errorMessage = 'The image could not be processed. Please try taking another photo.';
          break;
        case 'API_ERROR':
          errorTitle = 'Service Error';
          errorMessage = 'The identification service encountered an error. Please try again later.';
          break;
        case 'LOW_CONFIDENCE':
          // This should have been handled above, but fallback just in case
          errorTitle = 'Low Confidence Match';
          errorMessage = 'We couldn\'t identify this album with high confidence.';
          break;
        default:
          // Keep original message for unknown errors
          break;
      }
      
      Alert.alert(
        errorTitle,
        `${errorMessage}\n\nWould you like to enter the album details manually?`,
        [
          { 
            text: 'No', 
            style: 'cancel', 
            onPress: () => {
              setIdentifying(false);
              handleCancel();
            }
          },
          {
            text: 'Yes',
            onPress: () => {
              setIdentifying(false);
              navigation.navigate('AddRecord', { 
                imageUri: uri || undefined,
                initialArtist: error.extractedText?.split(' ')[0] || undefined,
                initialTitle: error.extractedText?.split(' ').slice(1).join(' ') || undefined,
              });
            },
          },
        ]
      );
    } finally {
      // CRITICAL: Always clear identifying state, no matter what happens
      setIdentifying(false);
      abortControllerRef.current = null;
    }
  };

  const handleTryAnotherMatch = () => {
    setResult(prev => {
      if (!prev || !Array.isArray(prev.alternates) || prev.alternates.length === 0) {
        return prev;
      }

      const [next, ...rest] = prev.alternates;

      // Put the current one back into the alternates list at the end
      const newAlternates = [...rest, prev.current];

      return {
        current: next,
        alternates: newAlternates,
      };
    });
  };

  const handleSave = async () => {
    console.log('[ScanRecord] 🔘 "Looks Good" button pressed');
    
    // CRITICAL: Prevent duplicate saves using ref (more reliable than state)
    if (savingRef.current) {
      console.log('[ScanRecord] ⚠️ Save already in progress, ignoring duplicate call');
      return;
    }
    
    if (!result?.current) {
      console.warn('[ScanRecord] ⚠️ handleSave called but no result.current');
      console.warn('[ScanRecord] result state:', result);
      Alert.alert('Error', 'No album match found. Please try scanning again.');
      return;
    }

    console.log('[ScanRecord] ✅ Result found, starting save process...');
    console.log('[ScanRecord] Result data:', {
      artist: result.current.artist,
      title: result.current.title,
      year: result.current.year,
      hasTracks: !!(result.current.tracks && result.current.tracks.length > 0),
      tracksCount: result.current.tracks?.length || 0,
    });

    // Set both state and ref immediately to prevent race conditions
    savingRef.current = true;
    setSaving(true);
    
    try {
      const currentMatch = result.current;
      // Check for duplicate
      const duplicate = await findDuplicateRecord(
        currentMatch.artist,
        currentMatch.title
      );

      if (duplicate) {
        Alert.alert(
          'Album Already in Library',
          `"${currentMatch.artist} - ${currentMatch.title}" is already in your library. Add again?`,
          [
            { 
              text: 'No', 
              style: 'cancel',
              onPress: () => {
                savingRef.current = false;
                setSaving(false);
              },
            },
            {
              text: 'Yes',
              onPress: async () => {
                // NOTE: savingRef.current is already true, don't set it again
                // Just call saveRecord directly
                try {
                  await saveRecord();
                } catch (error: any) {
                  console.error('[ScanRecord] ❌ Failed to save duplicate record', error);
                  Alert.alert('Error', `Could not save record: ${error?.message || 'Unknown error'}`);
                  savingRef.current = false;
                  setSaving(false);
                }
                // saveRecord will clear savingRef and setSaving on success
              },
            },
          ]
        );
        return;
      }

      // No duplicate - proceed with save
      await saveRecord();
    } catch (error) {
      console.error('[ScanRecord] ❌ Failed to save record', error);
      Alert.alert('Error', 'Could not save record.');
      savingRef.current = false;
      setSaving(false);
    } finally {
      // Only clear if not already cleared (in case of duplicate check)
      if (savingRef.current) {
        savingRef.current = false;
        setSaving(false);
      }
    }
  };

  const saveRecord = async () => {
    // NOTE: savingRef.current is already set to true by handleSave
    // This function is only called from handleSave, so we don't need to check/set it again
    
    if (!result?.current) {
      console.warn('[ScanRecord] ⚠️ saveRecord called but no result.current');
      savingRef.current = false;
      setSaving(false);
      return;
    }

    try {
      console.log('[ScanRecord] 💾 Starting save process...');
      const currentMatch = result.current;
      
      // CRITICAL: Use unified image selection logic
      // If metadata lookup returned a coverImageRemoteUrl, use it and ignore user photo
      // Only use user photo if no metadata match exists
      const { prepareImageFields } = require('../utils/imageSelection');
      const imageFields = prepareImageFields(
        currentMatch.coverImageRemoteUrl,
        capturedUri
      );
      
      console.log('[ScanRecord] 📝 Creating record in database...');
      console.log('[ScanRecord] Record data:', {
        title: currentMatch.title,
        artist: currentMatch.artist,
        year: currentMatch.year,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl ? 'SET' : 'NULL',
        coverImageLocalUri: imageFields.coverImageLocalUri ? 'SET' : 'NULL',
      });
      
      const newRecord = await createRecord({
        title: currentMatch.title,
        artist: currentMatch.artist,
        year: currentMatch.year ?? null,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
        coverImageLocalUri: imageFields.coverImageLocalUri,
      });
      
      console.log('[ScanRecord] ✅ Record created with ID:', newRecord.id);

      // Save tracks if available - CRITICAL: This must happen for tracks to appear
      if (currentMatch.tracks && currentMatch.tracks.length > 0) {
        console.log(`[ScanRecord] ✅ Attempting to save ${currentMatch.tracks.length} tracks for record ${newRecord.id}`);
        console.log(`[ScanRecord] Track list:`, currentMatch.tracks.map((t, i) => `${i + 1}. ${t.title}`).join(', '));
        let savedCount = 0;
        let failedCount = 0;
        for (const track of currentMatch.tracks) {
          try {
            if (!track.title || !track.title.trim()) {
              console.warn(`[ScanRecord] ⚠️ Skipping track with empty title`);
              continue;
            }
            await createTrack({
              recordId: newRecord.id,
              title: track.title.trim(),
              trackNumber: track.trackNumber ?? undefined,
              discNumber: track.discNumber ?? undefined,
              side: track.side ?? undefined,
              durationSeconds: track.durationSeconds ?? undefined,
            });
            savedCount++;
            console.log(`[ScanRecord] ✅ Saved track ${savedCount}: "${track.title}"`);
          } catch (error) {
            failedCount++;
            console.error(`[ScanRecord] ❌ Failed to save track "${track.title}":`, error);
            // Continue saving other tracks even if one fails
          }
        }
        if (savedCount > 0) {
          console.log(`[ScanRecord] ✅ Successfully saved ${savedCount}/${currentMatch.tracks.length} tracks`);
        }
        if (failedCount > 0) {
          console.warn(`[ScanRecord] ⚠️ Failed to save ${failedCount} tracks`);
        }
      } else {
        console.warn(`[ScanRecord] ⚠️ No tracks to save!`);
        console.warn(`[ScanRecord] currentMatch.tracks:`, currentMatch.tracks);
        console.warn(`[ScanRecord] tracks type:`, typeof currentMatch.tracks);
        console.warn(`[ScanRecord] tracks length:`, currentMatch.tracks?.length);
      }

      // CRITICAL: Save image hash mapping for future cache lookups
      // This allows re-identification of the same image without creating duplicate records
      try {
        if (capturedUri) {
          const imageHash = await generateImageHash(capturedUri);
          if (imageHash) {
            await saveImageHash(imageHash, newRecord.id, capturedUri);
            console.log('[ScanRecord] ✅ Saved image hash for future cache lookups');
          }
        }
      } catch (error) {
        console.warn('[ScanRecord] ⚠️ Failed to save image hash (non-critical):', error);
        // Don't fail - image hash caching is not critical
      }

      // Reset state BEFORE navigation to prevent duplicate saves
      console.log('[ScanRecord] ✅ Record saved successfully, clearing state...');
      setResult(null);
      setCapturedUri(null);
      savingRef.current = false; // Clear ref first
      setSaving(false); // Clear state
      
      Alert.alert('Success', 'Record added to library!', [
        { 
          text: 'OK', 
          onPress: () => {
            // Navigate to library - only navigate, don't call goBack() to avoid double navigation
            console.log('[ScanRecord] 🏠 Navigating to LibraryHome...');
            navigation.navigate('LibraryHome');
          }
        },
      ]);
    } catch (error: any) {
      console.error('[ScanRecord] ❌ Failed to save record', error);
      console.error('[ScanRecord] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      Alert.alert(
        'Error', 
        `Could not save record: ${error?.message || 'Unknown error'}`,
        [{ text: 'OK' }]
      );
      savingRef.current = false; // Clear ref on error
      setSaving(false); // Clear state on error
    }
  };

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 400],
  });

  // Helper function to sort tracks by position (simple numbered list, no sides)
  const sortTracksByPosition = (tracks?: Array<{ title: string; position?: number }>) => {
    if (!tracks || tracks.length === 0) return [];
    
    return [...tracks].sort((a, b) => {
      // Sort by position if available, otherwise maintain order
      if (a.position !== undefined && b.position !== undefined) {
        return a.position - b.position;
      }
      return 0;
    });
  };

  if (result?.current) {
    const currentMatch = result.current;
    const hasAlternates = Array.isArray(result.alternates) && result.alternates.length > 0;
    const sortedTracks = sortTracksByPosition(currentMatch.tracks);
    const hasTracks = currentMatch.tracks && currentMatch.tracks.length > 0;
    
    return (
      <AppScreen title="Confirm Match">
        <View style={styles.screenContainer}>
          <View style={styles.headerActions}>
            <AppIconButton
              name="close"
              onPress={handleCancel}
            />
          </View>
          <AppCard>
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Best Match
            </AppText>
            
            {/* HD Cover Image - Prioritizes remote HD cover from CAA/Discogs */}
            {(() => {
              const { getCoverImageUri } = require('../utils/imageSelection');
              const imageUri = getCoverImageUri(currentMatch.coverImageRemoteUrl, capturedUri);
              return imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={[styles.matchCover, { borderRadius: radius.md }]}
                  resizeMode="cover"
                />
              ) : null;
            })()}
            
            {/* Album Info */}
            <View style={{ marginTop: spacing.md }}>
              <AppText variant="title" style={{ marginBottom: spacing.xs }}>
                {currentMatch.title}
              </AppText>
              <AppText variant="subtitle" style={{ marginBottom: spacing.sm, color: colors.textSecondary }}>
                {currentMatch.artist}
              </AppText>
              
              {/* Year and Genre */}
              <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.md }}>
                {currentMatch.year && (
                  <AppText variant="caption" style={{ color: colors.textMuted }}>
                    {currentMatch.year}
                  </AppText>
                )}
                {currentMatch.confidence !== undefined && (
                  <AppText variant="caption" style={{ color: colors.textMuted }}>
                    {Math.round(currentMatch.confidence * 100)}% confidence
                  </AppText>
                )}
              </View>
              
              {/* Simple tracklist (no sides) */}
              {hasTracks && sortedTracks && sortedTracks.length > 0 && (
                <View style={{ marginTop: spacing.md, marginBottom: spacing.md }}>
                  <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
                    Tracklist ({sortedTracks.length} tracks)
                  </AppText>
                  <View style={{ gap: spacing.xs }}>
                    {sortedTracks.map((track, idx) => (
                      <View key={idx} style={{ marginLeft: spacing.sm }}>
                        <AppText variant="body">
                          {track.position ? `${track.position}. ` : `${idx + 1}. `}{track.title}
                        </AppText>
                      </View>
                    ))}
                  </View>
                </View>
              )}
              
              {/* Show if no tracks available */}
              {!hasTracks && (
                <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.md }}>
                  Tracklist not available
                </AppText>
              )}
            </View>

            <View style={styles.actions}>
              <AppButton
                title="Enter Details Manually"
                variant="ghost"
                onPress={() =>
                  navigation.navigate('AddRecord', { imageUri: capturedUri || undefined })
                }
                style={{ flex: 1 }}
              />
              {hasAlternates && (
                <AppButton
                  title="Try Another Match"
                  variant="secondary"
                  onPress={handleTryAnotherMatch}
                  style={{ flex: 1 }}
                />
              )}
              <AppButton
                title={saving ? "Saving..." : "Looks Good"}
                onPress={() => {
                  console.log('[ScanRecord] 🔘 Button onPress triggered');
                  console.log('[ScanRecord] Button state check:', {
                    saving,
                    savingRef: savingRef.current,
                    hasResult: !!result?.current,
                    resultArtist: result?.current?.artist,
                    resultTitle: result?.current?.title,
                  });
                  
                  // Debug: Check why button might be disabled
                  const isDisabled = saving || savingRef.current || !result?.current;
                  if (isDisabled) {
                    console.warn('[ScanRecord] ⚠️ Button press ignored - button is disabled:', {
                      saving,
                      savingRef: savingRef.current,
                      noResult: !result?.current,
                    });
                    if (!result?.current) {
                      Alert.alert('Error', 'No album match found. Please try scanning again.');
                    } else if (saving || savingRef.current) {
                      Alert.alert('Please Wait', 'Save is already in progress...');
                    }
                    return;
                  }
                  
                  console.log('[ScanRecord] ✅ Button is enabled, calling handleSave...');
                  // Use setTimeout to ensure state is fresh
                  setTimeout(() => {
                    handleSave();
                  }, 0);
                }}
                disabled={saving || savingRef.current || !result?.current}
                style={{ flex: 1 }}
              />
            </View>
          </AppCard>
        </View>
      </AppScreen>
    );
  }

  // Low-confidence review UI for record suggestions
  // CRITICAL: Only show canonical album suggestions from Discogs/MusicBrainz
  // Never show raw Vision web page titles, URLs, or store names
  const albumSuggestions = suggestions?.albumSuggestions || suggestions?.discogsSuggestions || [];
  const hasSuggestions = albumSuggestions.length > 0;
  
  if (suggestions && hasSuggestions) {
    return (
      <AppScreen title="Review Suggestions">
        <View style={styles.screenContainer}>
          <View style={styles.headerActions}>
            <AppIconButton
              name="close"
              onPress={() => {
                setSuggestions(null);
                handleCancel();
              }}
            />
          </View>
          <AppCard>
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              We found some possible matches:
            </AppText>
            <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
              {albumSuggestions
                .filter((suggestion: any) => {
                  // Defensive: Only render suggestions with valid album title and artist
                  return suggestion && 
                         suggestion.albumTitle && 
                         typeof suggestion.albumTitle === 'string' && 
                         suggestion.albumTitle.trim().length > 0 &&
                         suggestion.artist &&
                         typeof suggestion.artist === 'string' &&
                         suggestion.artist.trim().length > 0 &&
                         suggestion.discogsId; // Must have Discogs ID (canonical release)
                })
                .slice(0, 8) // Show up to 8 suggestions
                .map((suggestion, idx) => {
                  // Format as "Artist – Album Title"
                  const label = `${suggestion.artist.trim()} – ${suggestion.albumTitle.trim()}`;
                  
                  return (
                    <TouchableOpacity
                      key={idx}
                      style={[
                        styles.alternateItem,
                        {
                          backgroundColor: selectedSuggestion === suggestion ? colors.accentMuted : colors.surfaceAlt,
                          borderColor: colors.borderSubtle,
                        },
                      ]}
                      onPress={() => setSelectedSuggestion(suggestion)}
                    >
                      <AppText variant="body" style={{ fontWeight: '600' }}>{label}</AppText>
                      <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs }}>
                        {suggestion.releaseYear && (
                          <AppText variant="caption" style={{ color: colors.textMuted }}>
                            {suggestion.releaseYear}
                          </AppText>
                        )}
                        {suggestion.confidence !== undefined && (
                          <AppText variant="caption" style={{ color: colors.textMuted }}>
                            {Math.round(suggestion.confidence * 100)}% confidence
                          </AppText>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
            </View>
            <View style={styles.actions}>
              <AppButton
                title="None of These"
                variant="ghost"
                onPress={() => {
                  setSuggestions(null);
                  navigation.navigate('AddRecord', { 
                    imageUri: capturedUri || undefined,
                  });
                }}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Use This"
                onPress={() => {
                  if (selectedSuggestion) {
                    // Convert albumSuggestion to IdentificationMatch format
                    const match: IdentificationMatch = {
                      artist: selectedSuggestion.artist,
                      title: selectedSuggestion.albumTitle,
                      year: selectedSuggestion.releaseYear,
                      discogsId: selectedSuggestion.discogsId,
                      confidence: selectedSuggestion.confidence,
                      source: 'discogs',
                    };
                    
                    // Get other suggestions as alternates
                    const otherSuggestions = albumSuggestions
                      .filter((s: any) => s.discogsId !== selectedSuggestion.discogsId)
                      .slice(0, 2)
                      .map((s: any) => ({
                        artist: s.artist,
                        title: s.albumTitle,
                        year: s.releaseYear,
                        discogsId: s.discogsId,
                        confidence: s.confidence,
                        source: 'discogs',
                      }));
                    
                    setResult({
                      current: match,
                      alternates: otherSuggestions,
                    });
                    setSuggestions(null);
                    setSelectedSuggestion(null);
                  }
                }}
                disabled={!selectedSuggestion}
                style={{ flex: 1, marginLeft: spacing.sm }}
              />
            </View>
          </AppCard>
        </View>
      </AppScreen>
    );
  }

  if (identifying) {
    return (
      <AppScreen title="Identifying...">
        <View style={styles.screenContainer}>
          <View style={styles.headerActions}>
            <AppIconButton
              name="close"
              onPress={handleCancel}
            />
          </View>
          <View style={styles.centerContent}>
            <ActivityIndicator size="large" color={colors.accent} />
            <AppText variant="body" style={{ marginTop: spacing.md, marginBottom: spacing.lg, textAlign: 'center' }}>
              Identifying album...
            </AppText>
            <AppButton
              title="Cancel"
              variant="ghost"
              onPress={handleCancel}
            />
          </View>
        </View>
      </AppScreen>
    );
  }

  if (capturedUri && !result) {
    return (
      <AppScreen title="Processing...">
        <View style={styles.screenContainer}>
          <View style={styles.headerActions}>
            <AppIconButton
              name="close"
              onPress={handleCancel}
            />
          </View>
          <View style={styles.centerContent}>
            <Image
              source={{ uri: capturedUri }}
              style={[styles.previewImage, { borderRadius: radius.md }]}
            />
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: spacing.md, marginBottom: spacing.lg }} />
            <AppButton
              title="Cancel"
              variant="ghost"
              onPress={handleCancel}
            />
          </View>
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Scan Record" scroll={false}>
      <View style={styles.screenContainer}>
        <View style={styles.headerActionsLeft}>
          <AppIconButton
            name="arrow-back"
            onPress={() => navigation.goBack()}
          />
        </View>
        {/* Scan Mode Toggle */}
        <View style={[styles.modeToggle, { marginBottom: spacing.md }]}>
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: scanMode === 'image' ? colors.accent : colors.backgroundMuted,
                borderColor: colors.borderSubtle,
              },
            ]}
            onPress={() => setScanMode('image')}
          >
            <Ionicons 
              name="camera" 
              size={20} 
              color={scanMode === 'image' ? colors.background : colors.textSecondary} 
            />
            <AppText 
              variant="caption" 
              style={{ 
                color: scanMode === 'image' ? colors.background : colors.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Image
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: scanMode === 'barcode' ? colors.accent : colors.backgroundMuted,
                borderColor: colors.borderSubtle,
              },
            ]}
            onPress={() => setScanMode('barcode')}
          >
            <Ionicons 
              name="barcode" 
              size={20} 
              color={scanMode === 'barcode' ? colors.background : colors.textSecondary} 
            />
            <AppText 
              variant="caption" 
              style={{ 
                color: scanMode === 'barcode' ? colors.background : colors.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Barcode
            </AppText>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.modeButton,
              {
                backgroundColor: colors.backgroundMuted,
                borderColor: colors.borderSubtle,
              },
            ]}
            onPress={() => {
              navigation.navigate('AddRecord', {});
            }}
          >
            <Ionicons 
              name="create-outline" 
              size={20} 
              color={colors.textSecondary} 
            />
            <AppText 
              variant="caption" 
              style={{ 
                color: colors.textSecondary,
                marginLeft: spacing.xs,
              }}
            >
              Manual Entry
            </AppText>
          </TouchableOpacity>
        </View>

        <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={
            scanMode === 'barcode' ? {
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
            } : undefined
          }
          onBarcodeScanned={
            scanMode === 'barcode'
              ? async (event) => {
                  if (identifying) return; // Prevent multiple scans
                  const barcode = event.data;
                  console.log(`[ScanRecord] Barcode scanned: ${barcode}`);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  
                  setIdentifying(true);
                  setScanning(false);
                  
                  try {
                    const response = await identifyRecordByBarcode(barcode);
                    // Normalize response into ScanResult structure
                    const normalizedResult = normalizeScanResult(response);
                    setResult(normalizedResult);
                  } catch (error: any) {
                    console.error('Barcode identification failed', error);
                    Alert.alert(
                      'Barcode Not Found',
                      `Could not find album for barcode "${barcode}". Try scanning the cover image instead.`,
                      [
                        { text: 'OK', onPress: () => setScanMode('image') },
                      ]
                    );
                  } finally {
                    setIdentifying(false);
                  }
                }
              : undefined
          }
          onCameraReady={() => {
            setScanning(true);
          }}
        >
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <Animated.View
                style={[
                  styles.scanLine,
                  {
                    backgroundColor: colors.accent,
                    transform: [{ translateY: scanLineTranslateY }],
                  },
                ]}
              />
            </View>
            <AppText variant="caption" style={styles.instruction}>
              {scanMode === 'barcode' 
                ? 'Position barcode in frame\nIt will scan automatically'
                : 'Position album cover in frame\nTap the button below to capture'}
            </AppText>
          </View>
        </CameraView>
        <View style={styles.cameraControls}>
          {capturing ? (
            <View style={styles.captureButton}>
              <ActivityIndicator size="small" color={colors.background} />
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.captureButton,
                {
                  backgroundColor: colors.accent,
                },
              ]}
              onPress={handleManualCapture}
            >
              <Ionicons name="camera" size={32} color={colors.background} />
            </TouchableOpacity>
          )}
          <AppText variant="caption" style={{ marginTop: spacing.sm, color: colors.textMuted }}>
            Tap to capture and identify
          </AppText>
        </View>
      </View>
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
  modeToggle: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  modeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  cameraContainer: {
    flex: 1,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 300,
    height: 300,
    borderWidth: 2,
    borderColor: '#08F7FE',
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  scanLine: {
    position: 'absolute',
    width: '100%',
    height: 2,
    opacity: 0.8,
  },
  instruction: {
    marginTop: 24,
    color: '#F8F8F8',
    textAlign: 'center',
  },
  cameraControls: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#111113',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  previewImage: {
    width: 300,
    height: 300,
  },
  matchCover: {
    width: 200,
    height: 200,
    alignSelf: 'center',
  },
  divider: {
    height: 1,
    width: '100%',
  },
  alternateItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    marginTop: 24,
    gap: 12,
    alignItems: 'stretch',
  },
  screenContainer: {
    flex: 1,
    position: 'relative',
  },
  headerActions: {
    position: 'absolute',
    top: 16,
    right: 16,
    zIndex: 1000,
  },
  headerActionsLeft: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 1000,
  },
});

