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
  IdentificationMatch,
  IdentificationError,
} from '../services/RecordIdentificationService';
import { createRecord, findDuplicateRecord, createTrack } from '../data/repository';
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
  const [result, setResult] = useState<{
    bestMatch: IdentificationMatch;
    alternates: IdentificationMatch[];
    confidence: number;
  } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<IdentificationMatch | null>(null);
  const scanLineAnim = useRef(new Animated.Value(0)).current;
  const abortControllerRef = useRef<AbortController | null>(null);
  const cameraRef = useRef<CameraView | null>(null);
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
    setSelectedMatch(null);
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
        await handleCapture(photoUri);
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
      setResult(response);
      setSelectedMatch(response.bestMatch);
      abortControllerRef.current = null;
    } catch (error) {
      // Don't show error if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        return;
      }
      
      console.error('Identification failed', error);
      
      // Simplified error message
      Alert.alert(
        'Unable to Identify Record',
        'Continue to enter manually?',
        [
          { text: 'No', style: 'cancel', onPress: handleCancel },
          {
            text: 'Yes',
            onPress: () => {
              navigation.navigate('AddRecord', { imageUri: uri || undefined });
            },
          },
        ]
      );
    } finally {
      setIdentifying(false);
      abortControllerRef.current = null;
    }
  };

  const handleSave = async () => {
    if (!selectedMatch || !capturedUri) return;

    try {
      // Check for duplicate
      const duplicate = await findDuplicateRecord(
        selectedMatch.artist,
        selectedMatch.title
      );

      if (duplicate) {
        Alert.alert(
          'Album Already in Library',
          `"${selectedMatch.artist} - ${selectedMatch.title}" is already in your library. Add again?`,
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes',
              onPress: async () => {
                await saveRecord();
              },
            },
          ]
        );
        return;
      }

      await saveRecord();
    } catch (error) {
      console.error('Failed to save record', error);
      Alert.alert('Error', 'Could not save record.');
    }
  };

  const saveRecord = async () => {
    if (!selectedMatch || !capturedUri) return;

    try {
      // Prioritize professional image from Discogs if available
      const coverImageUri = selectedMatch.coverImageRemoteUrl || capturedUri;
      
      const newRecord = await createRecord({
        title: selectedMatch.title,
        artist: selectedMatch.artist,
        year: selectedMatch.year ?? null,
        coverImageLocalUri: capturedUri, // Keep local for offline access
        coverImageRemoteUrl: selectedMatch.coverImageRemoteUrl ?? null,
      });

      // Save tracks if available
      if (selectedMatch.tracks && selectedMatch.tracks.length > 0) {
        for (const track of selectedMatch.tracks) {
          try {
            await createTrack({
              recordId: newRecord.id,
              title: track.title,
              trackNumber: track.trackNumber ?? undefined,
              discNumber: track.discNumber ?? undefined,
              side: track.side ?? undefined,
              durationSeconds: track.durationSeconds ?? undefined,
            });
          } catch (error) {
            console.error('Failed to save track', track.title, error);
            // Continue saving other tracks even if one fails
          }
        }
        console.log(`[ScanRecord] Saved ${selectedMatch.tracks.length} tracks`);
      }

      // Reset state
      setResult(null);
      setSelectedMatch(null);
      setCapturedUri(null);
      
      Alert.alert('Success', 'Record added to library!', [
        { 
          text: 'OK', 
          onPress: () => {
            // Navigate and ensure library refreshes
            navigation.navigate('LibraryHome');
            // Also go back to allow library to refresh on focus
            setTimeout(() => navigation.goBack(), 100);
          }
        },
      ]);
    } catch (error) {
      console.error('Failed to save record', error);
      Alert.alert('Error', 'Could not save record.');
    }
  };

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 400],
  });

  if (result && selectedMatch) {
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
          {selectedMatch.coverImageRemoteUrl ? (
            <Image
              source={{ uri: selectedMatch.coverImageRemoteUrl }}
              style={[styles.matchCover, { borderRadius: radius.md }]}
            />
          ) : capturedUri ? (
            <Image
              source={{ uri: capturedUri }}
              style={[styles.matchCover, { borderRadius: radius.md }]}
            />
          ) : null}
          <AppText variant="body" style={{ marginTop: spacing.sm }}>
            {selectedMatch.artist}
          </AppText>
          <AppText variant="body" style={{ marginBottom: spacing.md }}>
            {selectedMatch.title}
          </AppText>
          {selectedMatch.year && (
            <AppText variant="caption" style={{ marginBottom: spacing.md }}>
              {selectedMatch.year}
            </AppText>
          )}

          {result.alternates.length > 0 && (
            <>
              <View
                style={[
                  styles.divider,
                  { backgroundColor: colors.borderSubtle, marginVertical: spacing.md },
                ]}
              />
              <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
                Alternates
              </AppText>
              {result.alternates.map((alt, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={[
                    styles.alternateItem,
                    {
                      backgroundColor:
                        selectedMatch === alt ? colors.accentMuted : colors.surfaceAlt,
                      borderColor: colors.borderSubtle,
                    },
                  ]}
                  onPress={() => setSelectedMatch(alt)}
                >
                  <AppText variant="body">{alt.artist}</AppText>
                  <AppText variant="body">{alt.title}</AppText>
                </TouchableOpacity>
              ))}
            </>
          )}

          <View style={styles.actions}>
            <AppButton
              title="Enter Details Manually"
              variant="ghost"
              onPress={() =>
                navigation.navigate('AddRecord', { imageUri: capturedUri || undefined })
              }
              style={{ flex: 1 }}
            />
            <AppButton
              title="Looks Good"
              onPress={handleSave}
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
            <AppText variant="body" style={{ marginTop: spacing.md, marginBottom: spacing.lg }}>
              Analyzing album cover...
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
        <View style={styles.cameraContainer}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing="back"
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
              Position album cover in frame{'\n'}
              Tap the button below to capture
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

