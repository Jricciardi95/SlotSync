/**
 * Dev Test Screen
 * 
 * Dev-only screen for testing identification with test images.
 * Only available in __DEV__ mode.
 */

import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Image, Alert } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { AppScreen } from '../components/AppScreen';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { AppCard } from '../components/AppCard';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { testIdentification, TEST_CASES } from '../utils/testHarness';
import { DEBUG_IDENTIFICATION } from '../utils/debug';
import { AppIconButton } from '../components/AppIconButton';
import { AppTheme } from '../theme';

type Props = NativeStackScreenProps<LibraryStackParamList, 'LibraryHome'>;

export const DevTestScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, spacing, radius } = useTheme();
  const styles = createStyles(spacing, colors, radius);
  
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  // Only show in dev mode
  if (!__DEV__) {
    return (
      <AppScreen title="Dev Test">
        <AppCard>
          <AppText>This screen is only available in development mode.</AppText>
        </AppCard>
      </AppScreen>
    );
  }

  const handlePickImage = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please grant photo library access to test identification.');
      return;
    }

    const pickerResult = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 1,
    });

    if (!pickerResult.canceled && pickerResult.assets[0]) {
      setSelectedImage(pickerResult.assets[0].uri);
      setResult(null);
    }
  };

  const handleTest = async () => {
    if (!selectedImage) {
      Alert.alert('No Image', 'Please select an image first.');
      return;
    }

    setTesting(true);
    setResult(null);

    try {
      const testResult = await testIdentification(selectedImage, 'Manual Test');
      setResult(testResult);
    } catch (error: any) {
      Alert.alert('Test Failed', error.message || 'Unknown error');
      setResult({
        success: false,
        error: error.message || String(error),
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <AppScreen title="Dev Test - Identification">
      <View style={styles.headerActions}>
        <AppIconButton name="arrow-back" onPress={() => navigation.goBack()} />
      </View>

      <ScrollView style={styles.container}>
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
            Debug Mode: {DEBUG_IDENTIFICATION ? 'ON' : 'OFF'}
          </AppText>
          <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.md }}>
            Enable debug logging by setting EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
          </AppText>

          <View style={styles.section}>
            <AppText variant="body" style={{ marginBottom: spacing.sm, fontWeight: '600' }}>
              Test Cases
            </AppText>
            {Object.entries(TEST_CASES).map(([name, testCase]) => (
              <View key={name} style={styles.testCase}>
                <AppText variant="body">{name}</AppText>
                <AppText variant="caption" style={{ color: colors.textMuted }}>
                  {testCase.description}
                </AppText>
              </View>
            ))}
          </View>

          <View style={styles.section}>
            <AppText variant="body" style={{ marginBottom: spacing.sm, fontWeight: '600' }}>
              Select Test Image
            </AppText>
            <AppButton
              title="Pick Image from Library"
              variant="secondary"
              onPress={handlePickImage}
              disabled={testing}
            />
            {selectedImage && (
              <View style={styles.imagePreview}>
                <Image source={{ uri: selectedImage }} style={styles.image} />
                <AppText variant="caption" style={{ marginTop: spacing.xs }}>
                  Selected: {selectedImage.split('/').pop()}
                </AppText>
              </View>
            )}
          </View>

          <AppButton
            title={testing ? 'Testing...' : 'Run Test'}
            onPress={handleTest}
            disabled={testing || !selectedImage}
            style={{ marginTop: spacing.md }}
          />
        </AppCard>

        {result && (
          <AppCard style={{ marginTop: spacing.md }}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
              Test Results
            </AppText>

            <View style={styles.resultSection}>
              <AppText variant="body" style={{ fontWeight: '600' }}>
                Status: {result.success ? '✅ SUCCESS' : '❌ FAILED'}
              </AppText>
              {result.error && (
                <AppText variant="caption" style={{ color: colors.error, marginTop: spacing.xs }}>
                  Error: {result.error}
                </AppText>
              )}
            </View>

            {result.finalAlbum && (
              <View style={styles.resultSection}>
                <AppText variant="body" style={{ fontWeight: '600', marginBottom: spacing.xs }}>
                  Final Album
                </AppText>
                <AppText variant="body">Artist: {result.finalAlbum.artist}</AppText>
                <AppText variant="body">Album: {result.finalAlbum.albumTitle}</AppText>
                <AppText variant="body">Year: {result.finalAlbum.releaseYear || 'N/A'}</AppText>
                <AppText variant="body">
                  Confidence: {(result.confidence * 100).toFixed(1)}%
                </AppText>
                <AppText variant="body">
                  Tracks: {result.finalAlbum.tracks?.length || 0}
                </AppText>
                <AppText variant="body">
                  Discogs ID: {result.finalAlbum.discogsId || 'N/A'}
                </AppText>
              </View>
            )}

            {result.candidates && result.candidates.length > 0 && (
              <View style={styles.resultSection}>
                <AppText variant="body" style={{ fontWeight: '600', marginBottom: spacing.xs }}>
                  Candidates ({result.candidates.length})
                </AppText>
                {result.candidates.slice(0, 10).map((c: any, i: number) => (
                  <AppText key={i} variant="caption" style={{ marginBottom: spacing.xs }}>
                    {i + 1}. {c.artist} - {c.album || c.title} ({c.confidence?.toFixed(3) || 'N/A'})
                  </AppText>
                ))}
              </View>
            )}

            {result.timing && (
              <View style={styles.resultSection}>
                <AppText variant="body" style={{ fontWeight: '600', marginBottom: spacing.xs }}>
                  Timing
                </AppText>
                <AppText variant="caption">Total: {result.timing.total}ms</AppText>
              </View>
            )}
          </AppCard>
        )}
      </ScrollView>
    </AppScreen>
  );
};

const createStyles = (
  spacing: AppTheme['spacing'],
  colors: AppTheme['colors'],
  radius: AppTheme['radius']
) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    headerActions: {
      position: 'absolute',
      top: spacing.lg,
      left: spacing.lg,
      zIndex: 1000,
    },
    section: {
      marginBottom: spacing.lg,
    },
    testCase: {
      marginBottom: spacing.sm,
      padding: spacing.sm,
      backgroundColor: colors.backgroundMuted,
      borderRadius: radius.sm,
    },
    imagePreview: {
      marginTop: spacing.md,
      alignItems: 'center',
    },
    image: {
      width: 200,
      height: 200,
      borderRadius: radius.md,
      backgroundColor: colors.backgroundMuted,
    },
    resultSection: {
      marginBottom: spacing.md,
      padding: spacing.sm,
      backgroundColor: colors.backgroundMuted,
      borderRadius: radius.sm,
    },
  });

