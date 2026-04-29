/**
 * ScanRecordScreen
 * 
 * Main screen for scanning and identifying vinyl records.
 * Orchestrates camera capture, identification, and saving flows.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { CameraView } from 'expo-camera';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppIconButton } from '../components/AppIconButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { IdentificationMatch } from '../services/RecordIdentificationService';
import { Ionicons } from '@expo/vector-icons';
import { checkBackendHealth, initializeApiBaseUrl } from '../config/api';
import { logger } from '../utils/logger';
import { trackBetaEvent } from '../monitoring/telemetry';

// Hooks
import { useRecordIdentification, AlbumSuggestion } from '../hooks/useRecordIdentification';
import { useRecordSave } from '../hooks/useRecordSave';
import { useCameraCapture } from '../hooks/useCameraCapture';

// Components
import { IdentificationResult } from '../components/IdentificationResult';

type Props = NativeStackScreenProps<LibraryStackParamList, 'ScanRecord'>;

export const ScanRecordScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing } = useTheme();
  const [scanMode, setScanMode] = useState<'image' | 'barcode'>('image');
  const scanLineAnim = React.useRef(new Animated.Value(0)).current;

  // Identification hook
  const identification = useRecordIdentification();
  const {
    identifying,
    identifyingStage,
    result,
    suggestions,
    selectedSuggestion,
    capturedUri,
    identifyFromImage,
    identifyFromBarcode,
    handleTryAnotherMatch,
    selectSuggestion,
    setSuggestions,
    setCapturedUri,
    setResult,
    cancelIdentification,
    clearResult,
    retryIdentification, // PR6: Retry function
  } = identification;

  // Save hook
  const { saving, saveRecord } = useRecordSave();

  // Camera hook
  const camera = useCameraCapture({
    scanMode,
    onBarcodeScanned: async (barcode: string) => {
      try {
        await identifyFromBarcode(barcode);
      } catch (error: any) {
        logger.error('[ScanRecord] Barcode identification failed', error);
        Alert.alert(
          'Barcode Not Found',
          `Could not find album for barcode "${barcode}". Try scanning the cover image instead.`,
          [
            { text: 'OK', onPress: () => setScanMode('image') },
          ]
        );
      }
    },
    onPhotoCaptured: async (uri: string) => {
      try {
        await identifyFromImage(uri);
      } catch (error: any) {
        // Handle LOW_CONFIDENCE errors that weren't caught by the hook
        if (error.code === 'LOW_CONFIDENCE') {
          // Hook already handled it, but if we get here, show manual entry
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

        // Handle other errors
        let errorTitle = 'Unable to Identify Record';
        let errorMessage = error.message || 'Unknown error occurred';
        
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
        }
        
        Alert.alert(
          errorTitle,
          `${errorMessage}\n\nWould you like to enter the album details manually?`,
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
      }
    },
    identifying,
    capturedUri,
  });

  const {
    permission,
    scanning,
    capturing,
    requestPermission,
    cameraRef,
    capturePhoto,
    setScanning,
    onCameraReady,
    onBarcodeScanned,
  } = camera;

  // ============================================================================
  // UI TIMERS & ANIMATIONS
  // ============================================================================
  // Scan line animation when scanning is active
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
  }, [scanning, scanLineAnim]);

  // ============================================================================
  // INITIALIZATION & HEALTH CHECKS
  // ============================================================================
  useEffect(() => {
    logger.debug('[ScanRecord] 📱 Component mounted');
    
    const initializeAndCheck = async () => {
      try {
        await initializeApiBaseUrl();
        logger.debug('[ScanRecord] 🔍 Performing backend health check on mount...');
        await checkBackendHealth(2000);
      } catch (error) {
        logger.warn('[ScanRecord] ⚠️ Health check failed on mount:', error);
      }
    };
    initializeAndCheck();
  }, []);

  // ============================================================================
  // HANDLERS
  // ============================================================================
  const handleCancel = useCallback(() => {
    logger.debug('[ScanRecord] ❌ Cancel handler called');
    cancelIdentification();
    clearResult(); // Clear result/suggestions to dismiss confirm match screen
    setCapturedUri(null);
    setScanning(true);
  }, [cancelIdentification, clearResult, setCapturedUri, setScanning]);

  const identifyingCopy =
    identifyingStage === 'scanning'
      ? 'Scanning cover...'
      : identifyingStage === 'matching'
      ? 'Matching album...'
      : identifyingStage === 'confirming'
      ? 'Confirming details...'
      : 'Identifying album...';

  const handleSave = useCallback(async () => {
    if (!result) {
      logger.warn('[ScanRecord] ⚠️ handleSave called but no result');
      Alert.alert('Error', 'No album match found. Please try scanning again.');
      return;
    }

    await saveRecord(result, capturedUri, navigation);
    // Clear result after save (handled in saveRecord via navigation)
    clearResult();
  }, [result, capturedUri, saveRecord, navigation, clearResult]);

  const handleManualCapture = useCallback(async () => {
    logger.debug('[ScanRecord] 📸 Capture button pressed');
    const uri = await capturePhoto();
    if (uri) {
      // onPhotoCaptured callback will be called automatically
    }
  }, [capturePhoto]);

  const handleUseSuggestion = useCallback((suggestion: AlbumSuggestion, allSuggestions: AlbumSuggestion[]) => {
    // Convert albumSuggestion to IdentificationMatch format
    const match: IdentificationMatch = {
      artist: suggestion.artist,
      title: suggestion.albumTitle,
      year: suggestion.releaseYear,
      discogsId: suggestion.discogsId,
      confidence: suggestion.confidence,
      source: suggestion.source || 'discogs',
    };
    
    // Get other suggestions as alternates
    const otherSuggestions = allSuggestions
      .filter((s: any) => s.discogsId !== suggestion.discogsId)
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
    trackBetaEvent('identify_candidate_confirmed', {
      source: suggestion.source ?? 'discogs',
      confidence: suggestion.confidence,
    });
    setSuggestions(null);
    selectSuggestion(null);
  }, [setResult, setSuggestions, selectSuggestion]);

  const handleEnterManually = useCallback((imageUri?: string) => {
    trackBetaEvent('identify_manual_fallback_opened', {
      hasImage: !!(imageUri || capturedUri),
    });
    navigation.navigate('AddRecord', { 
      imageUri: imageUri || capturedUri || undefined,
    });
  }, [navigation, capturedUri]);

  const scanLineTranslateY = scanLineAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 400],
  });

  // ============================================================================
  // PERMISSION & LOADING STATES
  // ============================================================================
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
        <View style={styles.centerContent}>
          <AppText variant="body" style={{ marginBottom: spacing.md }}>
            We need camera access to scan album covers.
          </AppText>
          <AppButton title="Grant Permission" onPress={requestPermission} />
        </View>
      </AppScreen>
    );
  }

  // ============================================================================
  // RESULT & SUGGESTIONS UI
  // ============================================================================
  if (result || suggestions) {
    return (
      <IdentificationResult
        result={result}
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
        capturedUri={capturedUri}
        saving={saving}
        onCancel={handleCancel}
        onSave={handleSave}
        onTryAnotherMatch={handleTryAnotherMatch}
        onSelectSuggestion={selectSuggestion}
        onUseSuggestion={handleUseSuggestion}
        onClearSuggestions={() => setSuggestions(null)}
        onEnterManually={handleEnterManually}
        onRetry={retryIdentification} // PR6: Retry function for retryable errors
        navigation={navigation}
      />
    );
  }

  // ============================================================================
  // IDENTIFYING STATE
  // ============================================================================
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
              {identifyingCopy}
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

  // ============================================================================
  // PROCESSING STATE (captured but not yet identifying)
  // ============================================================================
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

  // ============================================================================
  // CAMERA VIEW
  // ============================================================================
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
              scanMode === 'barcode' && !capturing ? {
                barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39'],
              } : undefined
            }
            onBarcodeScanned={scanMode === 'barcode' && !capturing ? onBarcodeScanned : undefined}
            onCameraReady={onCameraReady}
          />
          {/* Overlay positioned absolutely on top of camera with pointerEvents="none" */}
          <View style={styles.overlay} pointerEvents="none">
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
        </View>
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
    position: 'relative',
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
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
