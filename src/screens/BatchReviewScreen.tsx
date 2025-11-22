import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
} from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { AppScreen } from '../components/AppScreen';
import { AppCard } from '../components/AppCard';
import { AppText } from '../components/AppText';
import { AppButton } from '../components/AppButton';
import { useTheme } from '../hooks/useTheme';
import { LibraryStackParamList } from '../navigation/types';
import { useBatchScan } from '../contexts/BatchScanContext';
import {
  identifyRecord,
  IdentificationMatch,
} from '../services/RecordIdentificationService';
import {
  createRecord,
  findDuplicateRecord,
  createTrack,
  createBatchJob,
  getBatchPhotos,
  getBatchJob,
  deleteBatchJob,
  BatchPhoto,
} from '../data/repository';
import { batchProcessingService } from '../services/BatchProcessingService';
import { AppIconButton } from '../components/AppIconButton';
import { useFocusEffect } from '../navigation/useFocusEffect';

type Props = NativeStackScreenProps<LibraryStackParamList, 'BatchReview'>;

type ProcessedPhoto = {
  photoId: string;
  originalUri: string;
  status: 'processing' | 'success' | 'error' | 'pending';
  result?: {
    bestMatch: IdentificationMatch;
    alternates: IdentificationMatch[];
    confidence: number;
  };
  error?: string;
};

export const BatchReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing, radius } = useTheme();
  const { pendingPhotos, getPhotoById, removePhoto, clearPhotos } = useBatchScan();
  const { photoIds, jobId } = route.params || {};

  const [processedPhotos, setProcessedPhotos] = useState<ProcessedPhoto[]>([]);
  const [processing, setProcessing] = useState(false);
  const [processingIndex, setProcessingIndex] = useState(0);
  const [currentJobId, setCurrentJobId] = useState<string | null>(jobId || null);
  const [progress, setProgress] = useState({ current: 0, total: 0, completed: 0, failed: 0 });

  // Load job data if jobId exists (resuming from background)
  useEffect(() => {
    if (currentJobId) {
      loadJobData(currentJobId);
    } else if (photoIds && photoIds.length > 0) {
      // Initialize from pending photos if no jobId
      const initial: ProcessedPhoto[] = photoIds.map((id) => {
        const photo = getPhotoById(id);
        return {
          photoId: id,
          originalUri: photo?.uri || '',
          status: 'pending',
        };
      });
      setProcessedPhotos(initial);
    }
  }, [currentJobId, photoIds, getPhotoById]);

  // Check for background processing updates
  useEffect(() => {
    if (!currentJobId) return;

    const interval = setInterval(async () => {
      await loadJobData(currentJobId);
    }, 2000); // Check every 2 seconds

    return () => clearInterval(interval);
  }, [currentJobId]);

  const loadJobData = async (jobId: string) => {
    try {
      const [job, photos] = await Promise.all([
        getBatchJob(jobId),
        getBatchPhotos(jobId),
      ]);

      if (!job) return;

      const isProcessing = batchProcessingService.isProcessing(jobId);
      setProcessing(isProcessing || job.status === 'processing');

      // Convert batch photos to processed photos format
      const processed: ProcessedPhoto[] = photos.map((photo) => {
        let result: ProcessedPhoto['result'] | undefined;
        if (photo.status === 'success' && photo.resultData) {
          try {
            const parsed = JSON.parse(photo.resultData);
            result = {
              bestMatch: parsed.bestMatch,
              alternates: parsed.alternates,
              confidence: parsed.confidence,
            };
          } catch (error) {
            console.error('Failed to parse result data:', error);
          }
        }

        return {
          photoId: photo.id,
          originalUri: photo.photoUri,
          status: photo.status as ProcessedPhoto['status'],
          result,
          error: photo.errorMessage || undefined,
        };
      });

      // Sort by confidence (highest first, errors last)
      const sorted = processed.sort((a, b) => {
        if (a.status === 'error' && b.status !== 'error') return 1;
        if (a.status !== 'error' && b.status === 'error') return -1;
        if (a.status === 'success' && b.status === 'success') {
          return (b.result?.confidence || 0) - (a.result?.confidence || 0);
        }
        return 0;
      });

      setProcessedPhotos(sorted);

      // Update progress
      const completed = photos.filter((p) => p.status === 'success').length;
      const failed = photos.filter((p) => p.status === 'error').length;
      const current = photos.filter((p) => p.status !== 'pending').length;
      setProgress({
        current,
        total: photos.length,
        completed,
        failed,
      });

      // If all done, stop processing flag
      if (job.status === 'completed' || job.status === 'failed') {
        setProcessing(false);
      }
    } catch (error) {
      console.error('Failed to load job data:', error);
    }
  };

  const processAllPhotos = async () => {
    if (processedPhotos.length === 0) return;

    // Create batch job in database
    const photoUris = processedPhotos.map((p) => p.originalUri).filter(Boolean);
    const job = await createBatchJob(photoUris);
    setCurrentJobId(job.id);

    // Start background processing
    setProcessing(true);
    
    batchProcessingService.startProcessing(job.id, (progress) => {
      setProgress(progress);
      setProcessingIndex(progress.current - 1);
    });

    // Load initial data
    await loadJobData(job.id);
  };

  const handleAction = async (
    photo: ProcessedPhoto,
    action: 'yes' | 'edit' | 'cancel'
  ) => {
    if (action === 'cancel') {
      removePhoto(photo.photoId);
      setProcessedPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      return;
    }

    if (action === 'edit') {
      navigation.navigate('AddRecord', { imageUri: photo.originalUri });
      removePhoto(photo.photoId);
      return;
    }

    if (action === 'yes' && photo.result) {
      // Check for duplicate
      const duplicate = await findDuplicateRecord(
        photo.result.bestMatch.artist,
        photo.result.bestMatch.title
      );

      if (duplicate) {
        Alert.alert(
          'Album Already in Library',
          `"${photo.result.bestMatch.artist} - ${photo.result.bestMatch.title}" is already in your library. Add again?`,
          [
            { text: 'No', style: 'cancel' },
            {
              text: 'Yes',
              onPress: async () => {
                await saveRecord(photo);
              },
            },
          ]
        );
        return;
      }

      await saveRecord(photo);
    }
  };

  const saveRecord = async (photo: ProcessedPhoto) => {
    if (!photo.result) return;

    try {
      const newRecord = await createRecord({
        title: photo.result.bestMatch.title,
        artist: photo.result.bestMatch.artist,
        year: photo.result.bestMatch.year ?? null,
        coverImageLocalUri: photo.originalUri,
        coverImageRemoteUrl: photo.result.bestMatch.coverImageRemoteUrl ?? null,
      });

      // Save tracks if available
      if (photo.result.bestMatch.tracks && photo.result.bestMatch.tracks.length > 0) {
        for (const track of photo.result.bestMatch.tracks) {
          try {
            await createTrack({
              recordId: newRecord.id,
              title: track.title,
              trackNumber: track.trackNumber,
              discNumber: track.discNumber,
              side: track.side,
              durationSeconds: track.durationSeconds,
            });
          } catch (error) {
            console.error('Failed to save track', track.title, error);
          }
        }
      }

      // Remove from pending and processed
      removePhoto(photo.photoId);
      setProcessedPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));

      if (processedPhotos.length === 1) {
        // Last one, go back
        clearPhotos();
        navigation.navigate('LibraryHome');
      }
    } catch (error) {
      console.error('Failed to save record', error);
      Alert.alert('Error', 'Could not save record.');
    }
  };

  const handleBack = () => {
    // Processing continues in background - user can navigate away
    navigation.goBack();
  };

  const renderPhotoItem = (photo: ProcessedPhoto, index: number) => {
    const isProcessing = processing && progress.current > index;

    return (
      <AppCard key={photo.photoId} style={{ marginBottom: spacing.md }}>
        <View style={styles.photoContainer}>
          {/* Original Photo (Top Left) */}
          <View style={styles.photoColumn}>
            <AppText variant="caption" style={{ marginBottom: spacing.xs, color: colors.textMuted }}>
              Original Photo
            </AppText>
            <Image source={{ uri: photo.originalUri }} style={styles.photo} />
          </View>

          {/* Identified Image (Top Right) */}
          <View style={styles.photoColumn}>
            <AppText variant="caption" style={{ marginBottom: spacing.xs, color: colors.textMuted }}>
              Identified Image
            </AppText>
            {photo.status === 'processing' || isProcessing ? (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.backgroundMuted }]}>
                <ActivityIndicator color={colors.accent} />
              </View>
            ) : photo.status === 'success' && photo.result?.bestMatch.coverImageRemoteUrl ? (
              <Image
                source={{ uri: photo.result.bestMatch.coverImageRemoteUrl }}
                style={styles.photo}
              />
            ) : photo.status === 'error' ? (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.backgroundMuted }]}>
                <AppText variant="caption" style={{ color: colors.textMuted }}>
                  Not Found
                </AppText>
              </View>
            ) : (
              <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.backgroundMuted }]}>
                <AppText variant="caption" style={{ color: colors.textMuted }}>
                  Pending
                </AppText>
              </View>
            )}
          </View>
        </View>

        {/* Information Below */}
        {photo.status === 'success' && photo.result && (
          <View style={styles.infoContainer}>
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              {photo.result.bestMatch.artist}
            </AppText>
            <AppText variant="body" style={{ marginBottom: spacing.xs }}>
              {photo.result.bestMatch.title}
            </AppText>
            {photo.result.bestMatch.year && (
              <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
                Year: {photo.result.bestMatch.year}
              </AppText>
            )}
            <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.md }}>
              Confidence: {Math.round(photo.result.confidence * 100)}%
            </AppText>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <AppButton
                title="Yes"
                onPress={() => handleAction(photo, 'yes')}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Edit Manually"
                variant="secondary"
                onPress={() => handleAction(photo, 'edit')}
                style={{ flex: 1, marginLeft: spacing.sm }}
              />
              <AppButton
                title="Cancel"
                variant="ghost"
                onPress={() => handleAction(photo, 'cancel')}
                style={{ flex: 1, marginLeft: spacing.sm }}
              />
            </View>
          </View>
        )}

        {photo.status === 'error' && (
          <View style={styles.infoContainer}>
            <AppText variant="body" style={{ color: '#FF3B30', marginBottom: spacing.sm }}>
              {photo.error || 'Unable to identify record'}
            </AppText>
            <View style={styles.actionButtons}>
              <AppButton
                title="Edit Manually"
                variant="secondary"
                onPress={() => handleAction(photo, 'edit')}
                style={{ flex: 1 }}
              />
              <AppButton
                title="Cancel"
                variant="ghost"
                onPress={() => handleAction(photo, 'cancel')}
                style={{ flex: 1, marginLeft: spacing.sm }}
              />
            </View>
          </View>
        )}

        {photo.status === 'pending' && !processing && (
          <View style={styles.infoContainer}>
            <AppText variant="caption" style={{ color: colors.textMuted }}>
              Waiting to process...
            </AppText>
          </View>
        )}
      </AppCard>
    );
  };

  const allProcessed = processedPhotos.every((p) => p.status !== 'pending' && p.status !== 'processing');
  const hasPending = processedPhotos.some((p) => p.status === 'pending');

  return (
    <AppScreen title="Review Identifications">
      <View style={styles.headerActions}>
        <AppIconButton name="arrow-back" onPress={handleBack} />
        {!processing && hasPending && (
          <AppButton
            title="Process All"
            onPress={processAllPhotos}
            style={{ paddingHorizontal: spacing.md }}
          />
        )}
      </View>

      {processing && (
        <AppCard style={{ marginBottom: spacing.md }}>
          <View style={styles.processingContainer}>
            <ActivityIndicator color={colors.accent} size="large" />
            <AppText variant="body" style={{ marginTop: spacing.sm }}>
              Processing {processingIndex + 1} of {processedPhotos.length}...
            </AppText>
          </View>
        </AppCard>
      )}

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {processedPhotos.length === 0 ? (
          <AppCard>
            <AppText variant="body" style={{ textAlign: 'center', color: colors.textMuted }}>
              No photos to review
            </AppText>
          </AppCard>
        ) : (
          processedPhotos.map((photo, index) => renderPhotoItem(photo, index))
        )}
      </ScrollView>

      {allProcessed && processedPhotos.length > 0 && (
        <View style={[styles.footer, { backgroundColor: colors.background }]}>
          <AppText variant="caption" style={{ color: colors.textMuted, textAlign: 'center' }}>
            All photos processed. Review and save each one.
          </AppText>
        </View>
      )}
    </AppScreen>
  );
};

const styles = StyleSheet.create({
  headerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  photoContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  photoColumn: {
    flex: 1,
  },
  photo: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
  },
  photoPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoContainer: {
    marginTop: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  processingContainer: {
    alignItems: 'center',
    padding: 16,
  },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
});

