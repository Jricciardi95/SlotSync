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
  normalizeScanResult,
  ScanResult,
  IdentificationResponse,
} from '../services/RecordIdentificationService';
import {
  createRecord,
  findDuplicateRecord,
  createTrack,
  createBatchJob,
  getBatchPhotos,
  getBatchJob,
  deleteBatchJob,
} from '../data/repository';
import { batchProcessingService } from '../services/BatchProcessingService';
import { AppIconButton } from '../components/AppIconButton';
import { useFocusEffect } from '../navigation/useFocusEffect';

type Props = NativeStackScreenProps<LibraryStackParamList, 'BatchReview'>;

type ProcessedPhoto = {
  photoId: string;
  originalUri: string;
  status: 'processing' | 'success' | 'error' | 'pending';
  result?: ScanResult & {
    confidence?: number;
    isSuggestion?: boolean;
    extractedText?: string;
  };
  error?: string;
};

export const BatchReviewScreen: React.FC<Props> = ({ navigation, route }) => {
  const { colors, spacing, radius } = useTheme();
  const { pendingPhotos, getPhotoById, removePhoto, clearPhotos } = useBatchScan();
  const { photoIds, jobId, autoStart } = route.params || {};

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
      
      // Auto-start processing if autoStart flag is set
      if (autoStart && initial.length > 0) {
        // Small delay to ensure state is set, then start processing
        setTimeout(async () => {
          // Create batch job and start processing immediately
          const photoUris = initial.map((p) => p.originalUri).filter(Boolean);
          const job = await createBatchJob(photoUris);
          setCurrentJobId(job.id);
          setProcessing(true);
          
          batchProcessingService.startProcessing(job.id, (progress) => {
            setProgress(progress);
            setProcessingIndex(progress.current - 1);
          });
          
          await loadJobData(job.id);
        }, 200);
      }
    }
  }, [currentJobId, photoIds, getPhotoById, autoStart]);

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
            // Normalize into ScanResult structure
            const normalized = normalizeScanResult({
              bestMatch: parsed.bestMatch,
              alternates: parsed.alternates || [],
              confidence: parsed.confidence || 0.5,
              candidates: parsed.candidates,
              primaryMatch: parsed.primaryMatch,
            });
            result = {
              ...normalized,
              confidence: parsed.confidence,
              isSuggestion: parsed.isSuggestion || false,
              extractedText: parsed.extractedText,
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
    // Get current processed photos (may be empty initially)
    const photosToProcess = processedPhotos.length > 0 
      ? processedPhotos 
      : (photoIds && photoIds.length > 0 
          ? photoIds.map((id) => {
              const photo = getPhotoById(id);
              return {
                photoId: id,
                originalUri: photo?.uri || '',
                status: 'pending' as const,
              };
            })
          : []);

    if (photosToProcess.length === 0) {
      console.warn('[BatchReview] No photos to process');
      return;
    }

    // Update state if we initialized from photoIds
    if (processedPhotos.length === 0 && photosToProcess.length > 0) {
      setProcessedPhotos(photosToProcess);
    }

    // Create batch job in database
    const photoUris = photosToProcess.map((p) => p.originalUri).filter(Boolean);
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

  const handleTryAnotherForItem = (itemId: string) => {
    setProcessedPhotos(prevItems =>
      prevItems.map(item => {
        if (item.photoId !== itemId) return item;
        const { result } = item;
        if (!result || !Array.isArray(result.alternates) || result.alternates.length === 0) {
          return item;
        }

        const [next, ...rest] = result.alternates;
        return {
          ...item,
          result: {
            ...result,
            current: next,
            alternates: [...rest, result.current],
          },
        };
      })
    );
  };

  const handleAction = async (
    photo: ProcessedPhoto,
    action: 'yes' | 'edit' | 'cancel'
  ) => {
    if (action === 'cancel') {
      // CRITICAL: Cancel should only remove from batch list, nothing else
      // No save, no navigation, no API calls - just remove the card
      removePhoto(photo.photoId);
      setProcessedPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      return;
    }

    if (action === 'edit') {
      // Edit Manually: Navigate to AddRecord screen with the identified image if available
      // The AddRecord screen will handle saving with the correct image priority
      const imageUri = photo.result?.current.coverImageRemoteUrl || photo.originalUri;
      navigation.navigate('AddRecord', { 
        imageUri,
        initialArtist: photo.result?.current.artist,
        initialTitle: photo.result?.current.title,
        initialYear: photo.result?.current.year,
        // Pass the identified image URL so AddRecord can use it
        identifiedImageUrl: photo.result?.current.coverImageRemoteUrl,
      });
      // Remove from batch list since user is editing manually
      removePhoto(photo.photoId);
      setProcessedPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));
      return;
    }

    if (action === 'yes' && photo.result) {
      const currentMatch = photo.result.current;
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
      const currentMatch = photo.result.current;
      
      // CRITICAL: Use unified image selection logic
      // If metadata lookup returned a coverImageRemoteUrl, use it and ignore user photo
      // Only use user photo if no metadata match exists
      const { prepareImageFields } = require('../utils/imageSelection');
      const imageFields = prepareImageFields(
        currentMatch.coverImageRemoteUrl,
        photo.originalUri
      );
      
      // PR3: createRecord now returns { record, isNew } and handles duplicates
      const { record: newRecord, isNew } = await createRecord({
        title: currentMatch.title,
        artist: currentMatch.artist,
        year: currentMatch.year ?? null,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
        coverImageLocalUri: imageFields.coverImageLocalUri,
        discogsId: currentMatch.discogsId ? String(currentMatch.discogsId) : null,
      });

      // PR3: Only save tracks if this is a new record
      if (!isNew) {
        // Record already exists - skip track creation
        return;
      }

      // Save tracks if available (only for new records)
      if (currentMatch.tracks && currentMatch.tracks.length > 0) {
        for (const track of currentMatch.tracks) {
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

      // CRITICAL: Remove from batch list immediately after successful save
      // This ensures the card disappears right away, providing immediate feedback
      removePhoto(photo.photoId);
      setProcessedPhotos((prev) => prev.filter((p) => p.photoId !== photo.photoId));

      // If this was the last item, navigate back to library
      const remainingCount = processedPhotos.length - 1;
      if (remainingCount === 0) {
        clearPhotos();
        navigation.navigate('LibraryHome');
      }
    } catch (error) {
      console.error('Failed to save record', error);
      Alert.alert('Error', 'Could not save record.');
      // CRITICAL: Don't remove from list if save failed
      // The card should remain visible so user can try again or edit manually
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
            ) : photo.status === 'success' && photo.result?.current.coverImageRemoteUrl ? (
              <Image
                source={{ uri: photo.result.current.coverImageRemoteUrl }}
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
            {photo.result.isSuggestion && (
              <View style={[styles.suggestionBanner, { backgroundColor: colors.accentMuted, marginBottom: spacing.md }]}>
                <AppText variant="caption" style={{ color: colors.accent, fontWeight: '600' }}>
                  ⚠️ Low Confidence Match - Please Review
                </AppText>
                {photo.result.extractedText && (
                  <AppText variant="caption" style={{ color: colors.textMuted, marginTop: spacing.xs }}>
                    Extracted: "{photo.result.extractedText}"
                  </AppText>
                )}
              </View>
            )}
            
            <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
              {photo.result.current.artist}
            </AppText>
            <AppText variant="body" style={{ marginBottom: spacing.xs }}>
              {photo.result.current.title}
            </AppText>
            {photo.result.current.year && (
              <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.sm }}>
                Year: {photo.result.current.year}
              </AppText>
            )}
            <AppText variant="caption" style={{ color: colors.textMuted, marginBottom: spacing.md }}>
              Confidence: {Math.round((photo.result.confidence || 0) * 100)}%
            </AppText>

            {/* Action Buttons */}
            <View style={styles.actionButtons}>
              <View style={styles.buttonRow}>
                <AppButton
                  title={photo.result.isSuggestion ? "Accept" : "Yes"}
                  onPress={() => handleAction(photo, 'yes')}
                  style={styles.primaryButton}
                />
                {Array.isArray(photo.result.alternates) && photo.result.alternates.length > 0 && (
                  <AppButton
                    title="Try Another"
                    variant="secondary"
                    onPress={() => handleTryAnotherForItem(photo.photoId)}
                    style={[styles.secondaryButton, { marginLeft: spacing.xs }]}
                  />
                )}
              </View>
              <View style={[styles.buttonRow, { marginTop: spacing.xs }]}>
                <AppButton
                  title="Edit Manually"
                  variant="secondary"
                  onPress={() => handleAction(photo, 'edit')}
                  style={styles.secondaryButton}
                />
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  onPress={() => handleAction(photo, 'cancel')}
                  style={[styles.secondaryButton, { marginLeft: spacing.xs }]}
                />
              </View>
            </View>
          </View>
        )}

        {photo.status === 'error' && (
          <View style={styles.infoContainer}>
            <AppText variant="body" style={{ color: '#FF3B30', marginBottom: spacing.sm }}>
              {photo.error || 'Unable to identify record'}
            </AppText>
            <View style={styles.actionButtons}>
              <View style={styles.buttonRow}>
                <AppButton
                  title="Edit Manually"
                  variant="secondary"
                  onPress={() => handleAction(photo, 'edit')}
                  style={styles.secondaryButton}
                />
                <AppButton
                  title="Cancel"
                  variant="ghost"
                  onPress={() => handleAction(photo, 'cancel')}
                  style={[styles.secondaryButton, { marginLeft: spacing.xs }]}
                />
              </View>
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
        {/* Process All button removed - processing starts automatically when autoStart flag is set */}
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
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    minWidth: 80,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 100,
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
  suggestionBanner: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  alternateItem: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
});

