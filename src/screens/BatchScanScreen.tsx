import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Image,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { convertToJpeg, convertMultipleToJpeg } from '../utils/imageConverter';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { useBatchScan, PendingPhoto } from '../contexts/BatchScanContext';
import { importCsvRowsWithEnrichment, CsvRow } from '../utils/csvImport';

type Props = NativeStackScreenProps<LibraryStackParamList, 'BatchScan'>;

// PendingPhoto type is now imported from context

export const BatchScanScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [importingCSV, setImportingCSV] = useState(false);
  const { pendingPhotos, addPhoto, removePhoto, clearPhotos } = useBatchScan();
  const cameraRef = useRef<CameraView>(null);

  useEffect(() => {
    if (permission && !permission.granted && !permission.canAskAgain) {
      Alert.alert(
        'Camera Permission Required',
        'Please enable camera access in Settings to scan album covers.'
      );
    }
  }, [permission]);

  const handleCapture = async () => {
    if (!cameraRef.current || !permission?.granted) {
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) return;
      }
      return;
    }

    setCapturing(true);
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 1.0, // Maximum quality for better OCR/recognition
        base64: false,
        skipProcessing: false, // Keep image processing for better results (same as single scan)
        exif: false, // Don't need EXIF data
      });

      if (photo?.uri) {
        // CRITICAL: Convert to JPEG before adding (HEIC → JPEG)
        console.log('[BatchScan] Converting captured image to JPEG...');
        const jpegUri = await convertToJpeg(photo.uri, {
          maxWidth: 1200,
          quality: 0.8,
        });
        console.log('[BatchScan] ✅ Image converted to JPEG');
        const newPhoto: PendingPhoto = {
          id: `photo_${Date.now()}_${Math.random()}`,
          uri: jpegUri, // Use JPEG version, not original
          timestamp: Date.now(),
        };
        addPhoto(newPhoto);
      }
    } catch (error) {
      console.error('Failed to capture photo', error);
      Alert.alert('Error', 'Could not capture photo. Please try again.');
    } finally {
      setCapturing(false);
    }
  };

  const handlePickFromLibrary = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission required',
        'Please allow photo access to select album covers.'
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsMultipleSelection: true,
      quality: 1.0, // Get full quality, we'll compress in conversion
      allowsEditing: false,
      exif: false,
    });

      if (!result.canceled && result.assets) {
        // CRITICAL: Convert all selected images to JPEG (HEIC → JPEG)
        console.log(`[BatchScan] Converting ${result.assets.length} selected images to JPEG...`);
        const imageUris = result.assets.map(asset => asset.uri);
        const jpegUris = await convertMultipleToJpeg(imageUris, {
          maxWidth: 1200,
          quality: 0.8,
        });
        console.log(`[BatchScan] ✅ Converted ${jpegUris.length} images to JPEG`);
        
        jpegUris.forEach((jpegUri, index) => {
          const newPhoto: PendingPhoto = {
            id: `photo_${Date.now()}_${Math.random()}_${index}`,
            uri: jpegUri, // Use JPEG version, not original
            timestamp: Date.now(),
          };
          addPhoto(newPhoto);
        });
      }
  };

  const handleRemovePhoto = (photoId: string) => {
    removePhoto(photoId);
  };

  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let currentLine: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (inQuotes && nextChar === '"') {
          currentField += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        currentLine.push(currentField.trim());
        currentField = '';
      } else if ((char === '\n' || char === '\r') && !inQuotes) {
        if (currentField || currentLine.length > 0) {
          currentLine.push(currentField.trim());
          currentField = '';
        }
        if (currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = [];
        }
      } else {
        currentField += char;
      }
    }

    if (currentField || currentLine.length > 0) {
      currentLine.push(currentField.trim());
      lines.push(currentLine);
    }

    return lines;
  };

  const handleUploadCSV = async () => {
    try {
      setImportingCSV(true);
      
      const result = await DocumentPicker.getDocumentAsync({
        type: 'text/csv',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.[0]) {
        setImportingCSV(false);
        return;
      }

      const fileUri = result.assets[0].uri;
      const fileContent = await FileSystem.readAsStringAsync(fileUri);
      const lines = parseCSV(fileContent);

      if (lines.length < 2) {
        Alert.alert('Error', 'CSV file has no data rows.');
        setImportingCSV(false);
        return;
      }

      const headers = lines[0].map(h => h.toLowerCase());
      const dataRows = lines.slice(1);

      // Auto-detect column indices
      const artistIdx = headers.findIndex(h => h.includes('artist') || h.includes('performer'));
      const titleIdx = headers.findIndex(h => h.includes('title') || h.includes('album'));
      const yearIdx = headers.findIndex(h => h.includes('year') || h.includes('date'));
      const notesIdx = headers.findIndex(h => h.includes('notes') || h.includes('comment'));

      if (artistIdx === -1 || titleIdx === -1) {
        Alert.alert(
          'Missing Columns',
          'CSV must contain "Artist" and "Title" columns. Please check your file format.'
        );
        setImportingCSV(false);
        return;
      }

      // Parse rows into CsvRow format
      const csvRows: CsvRow[] = [];
      for (const row of dataRows) {
        if (row.length <= Math.max(artistIdx, titleIdx)) {
          continue; // Skip invalid rows
        }

        const artist = row[artistIdx]?.trim() || '';
        const title = row[titleIdx]?.trim() || '';

        if (!artist || !title) {
          continue; // Skip rows without artist/title
        }

        // Parse year from CSV - reject 2025
        let year: number | null = null;
        if (yearIdx >= 0 && row[yearIdx]) {
          const yearStr = row[yearIdx].trim();
          const parsedYear = parseInt(yearStr, 10);
          const currentYear = new Date().getFullYear();
          if (!isNaN(parsedYear) && parsedYear >= 1900 && parsedYear <= currentYear + 1 && parsedYear !== 2025) {
            year = parsedYear;
          }
        }

        const notes = notesIdx >= 0 ? row[notesIdx]?.trim() : null;

        csvRows.push({
          artist,
          title,
          year,
          notes,
          releaseId: null, // BatchScan doesn't support releaseId column
        });
      }

      // Import rows with concurrency and retry
      const importResult = await importCsvRowsWithEnrichment(csvRows, {
        concurrency: 4,
        maxRetries: 2,
      });

      const imported = importResult.imported;
      const skipped = importResult.skipped;

      // Log failures for debugging
      if (importResult.failures.length > 0) {
        console.warn(`[BatchScan CSV] ⚠️  ${importResult.failures.length} rows failed:`);
        for (const failure of importResult.failures) {
          console.warn(`[BatchScan CSV]   - Row ${failure.rowIndex + 1}: "${failure.artist}" - "${failure.title}": ${failure.error}`);
        }
      }

      setImportingCSV(false);

      Alert.alert(
        'Import Complete',
        `Successfully imported ${imported} records to your library.${skipped > 0 ? ` ${skipped} rows were skipped.` : ''}`,
        [
          {
            text: 'OK',
            onPress: () => {
              // Navigate to library to see the imported records
              navigation.navigate('LibraryHome');
            },
          },
        ]
      );
    } catch (error) {
      console.error('CSV import failed', error);
      setImportingCSV(false);
      Alert.alert('Error', 'Could not import CSV file. Please check the file format and try again.');
    }
  };

  const handleProcessAll = () => {
    if (pendingPhotos.length === 0) {
      Alert.alert('No Photos', 'Please add at least one photo to process.');
      return;
    }
    // Navigate to review screen and auto-start processing
    navigation.navigate('BatchReview', { 
      photoIds: pendingPhotos.map((p) => p.id),
      autoStart: true, // Flag to auto-start processing
    });
  };

  const handleClearAll = () => {
    if (pendingPhotos.length === 0) return;
    
    Alert.alert(
      'Clear All Photos?',
      `Remove all ${pendingPhotos.length} pending photo(s)?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            clearPhotos();
          },
        },
      ]
    );
  };

  const handleCancel = () => {
    if (pendingPhotos.length > 0) {
      Alert.alert(
        'Discard Photos?',
        `You have ${pendingPhotos.length} photo(s) pending. Are you sure you want to discard them?`,
        [
          { text: 'Keep Photos', style: 'cancel' },
          {
            text: 'Discard',
            style: 'destructive',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } else {
      navigation.goBack();
    }
  };

  if (!permission) {
    return (
      <AppScreen title="Batch Scan">
        <View style={styles.centerContent}>
          <ActivityIndicator color={colors.accent} />
        </View>
      </AppScreen>
    );
  }

  if (!permission.granted) {
    return (
      <AppScreen title="Batch Scan">
        <View style={styles.centerContent}>
          <AppText variant="body" style={{ marginBottom: spacing.md, textAlign: 'center' }}>
            Camera permission is required to scan album covers.
          </AppText>
          <AppButton title="Grant Permission" onPress={requestPermission} />
          <AppButton
            title="Cancel"
            variant="ghost"
            style={{ marginTop: spacing.sm }}
            onPress={handleCancel}
          />
        </View>
      </AppScreen>
    );
  }

  return (
    <AppScreen title="Batch Scan">
      <View style={styles.screenContainer}>
        <View style={styles.headerInfo}>
          <AppText variant="caption" style={{ color: colors.textMuted }}>
            {pendingPhotos.length} photo{pendingPhotos.length !== 1 ? 's' : ''} pending
          </AppText>
        </View>

        {/* Camera Preview - Square */}
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef as any}
            style={styles.camera}
            facing="back"
            onCameraReady={() => setScanning(true)}
          />
        </View>

        {/* Camera Controls Below */}
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
              onPress={handleCapture}
            >
              <Ionicons name="camera" size={32} color={colors.background} />
            </TouchableOpacity>
          )}
          <AppText variant="caption" style={{ marginTop: spacing.sm, color: colors.textMuted }}>
            Tap to capture
          </AppText>
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <AppButton
            title="Pick from Library"
            variant="secondary"
            onPress={handlePickFromLibrary}
            style={{ flex: 1 }}
            disabled={importingCSV}
          />
          <AppButton
            title="Upload CSV File"
            variant="secondary"
            onPress={handleUploadCSV}
            style={{ flex: 1, marginLeft: spacing.sm }}
            disabled={importingCSV}
          />
        </View>

        {importingCSV && (
          <View style={styles.importStatus}>
            <ActivityIndicator size="small" color={colors.accent} />
            <AppText variant="caption" style={{ marginLeft: spacing.sm, color: colors.textMuted }}>
              Importing CSV records...
            </AppText>
          </View>
        )}

        {pendingPhotos.length > 0 && (
          <AppButton
            title={`Process All (${pendingPhotos.length})`}
            onPress={handleProcessAll}
            disabled={importingCSV}
            style={{ marginTop: spacing.xs, marginHorizontal: 16 }}
          />
        )}

        {/* Pending Photos Grid */}
        {pendingPhotos.length > 0 && (
          <AppCard>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm }}>
              <AppText variant="subtitle">
                Pending Photos ({pendingPhotos.length})
              </AppText>
              <AppButton
                title="Clear All"
                variant="ghost"
                onPress={handleClearAll}
                style={{ paddingHorizontal: spacing.sm, paddingVertical: spacing.xs }}
              />
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.photoGrid}>
                {pendingPhotos.map((photo) => (
                  <View key={photo.id} style={styles.photoItem}>
                    <Image source={{ uri: photo.uri }} style={styles.thumbnail} />
                    <TouchableOpacity
                      style={[styles.removeButton, { backgroundColor: '#FF3B30' }]}
                      onPress={() => handleRemovePhoto(photo.id)}
                    >
                      <Ionicons name="close" size={16} color="white" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            </ScrollView>
          </AppCard>
        )}
      </View>
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  screenContainer: {
    flex: 1,
    gap: 16,
  },
  headerInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  cameraContainer: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 12,
    overflow: 'hidden',
    marginHorizontal: 16,
    alignSelf: 'center',
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  cameraControls: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOpacity: 0.6,
    shadowOffset: { width: 0, height: 4 },
    shadowRadius: 12,
  },
  actionButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
    marginTop: -8,
  },
  photoGrid: {
    flexDirection: 'row',
    gap: 12,
  },
  photoItem: {
    position: 'relative',
  },
  thumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
  },
  removeButton: {
    position: 'absolute',
    top: -8,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  importStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    marginTop: 12,
  },
});

