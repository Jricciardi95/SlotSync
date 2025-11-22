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
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { Ionicons } from '@expo/vector-icons';
import { useBatchScan, PendingPhoto } from '../contexts/BatchScanContext';

type Props = NativeStackScreenProps<LibraryStackParamList, 'BatchScan'>;

// PendingPhoto type is now imported from context

export const BatchScanScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanning, setScanning] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const { pendingPhotos, addPhoto, removePhoto } = useBatchScan();
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
        const newPhoto: PendingPhoto = {
          id: `photo_${Date.now()}_${Math.random()}`,
          uri: photo.uri,
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
      quality: 1.0, // Maximum quality for better OCR/recognition
      allowsEditing: false, // Don't allow editing to preserve original quality
      exif: false, // Don't need EXIF data
    });

      if (!result.canceled && result.assets) {
        result.assets.forEach((asset) => {
          const newPhoto: PendingPhoto = {
            id: `photo_${Date.now()}_${Math.random()}_${asset.uri}`,
            uri: asset.uri,
            timestamp: Date.now(),
          };
          addPhoto(newPhoto);
        });
      }
  };

  const handleRemovePhoto = (photoId: string) => {
    removePhoto(photoId);
  };

  const handleProcessAll = () => {
    if (pendingPhotos.length === 0) {
      Alert.alert('No Photos', 'Please add at least one photo to process.');
      return;
    }
    navigation.navigate('BatchReview', { photoIds: pendingPhotos.map((p) => p.id) });
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
            ref={cameraRef}
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
          />
          <AppButton
            title={`Process All (${pendingPhotos.length})`}
            onPress={handleProcessAll}
            disabled={pendingPhotos.length === 0}
            style={{ flex: 1, marginLeft: spacing.sm }}
          />
        </View>

        {/* Pending Photos Grid */}
        {pendingPhotos.length > 0 && (
          <AppCard>
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              Pending Photos ({pendingPhotos.length})
            </AppText>
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
  },
  camera: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  cameraControls: {
    alignItems: 'center',
    paddingVertical: 16,
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
});

