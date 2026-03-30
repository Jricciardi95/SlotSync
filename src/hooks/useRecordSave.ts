/**
 * useRecordSave Hook
 * 
 * Manages record saving logic with duplicate checking and race condition prevention.
 * Handles saving state, duplicate detection, and navigation after save.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { LibraryStackParamList } from '../navigation/types';
import { ScanResult } from '../services/RecordIdentificationService';
import { createRecord, findDuplicateRecord, createTrack, saveImageHash } from '../data/repository';
import { generateImageHash } from '../utils/imageHash';
import { logger } from '../utils/logger';

export interface UseRecordSaveReturn {
  saving: boolean;
  saveRecord: (result: ScanResult, capturedUri: string | null, navigation: NavigationProp<LibraryStackParamList>) => Promise<void>;
}

export function useRecordSave(): UseRecordSaveReturn {
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  // SAFETY: Reset savingRef if it's stuck (e.g., from a crash or navigation)
  useEffect(() => {
    if (!saving && savingRef.current) {
      logger.warn('[useRecordSave] ⚠️ Detected stuck savingRef, resetting...');
      savingRef.current = false;
    }
  }, [saving]);

  const saveRecord = useCallback(async (
    result: ScanResult,
    capturedUri: string | null,
    navigation: NavigationProp<LibraryStackParamList>
  ) => {
    logger.debug('[useRecordSave] 🔘 Save record called');
    
    // CRITICAL: Atomic guard pattern to prevent race conditions
    if (savingRef.current) {
      logger.debug('[useRecordSave] ⚠️ Save already in progress, ignoring duplicate call');
      return;
    }
    
    // CRITICAL: Set ref FIRST (before any validation or async work)
    savingRef.current = true;
    setSaving(true);
    
    try {
      // Validate result AFTER setting ref
      if (!result?.current) {
        logger.warn('[useRecordSave] ⚠️ saveRecord called but no result.current');
        logger.warn('[useRecordSave] result state:', result);
        Alert.alert('Error', 'No album match found. Please try scanning again.');
        return;
      }

      logger.debug('[useRecordSave] ✅ Result found, starting save process...');
      logger.debug('[useRecordSave] Result data:', {
        artist: result.current.artist,
        title: result.current.title,
        year: result.current.year,
        hasTracks: !!(result.current.tracks && result.current.tracks.length > 0),
        tracksCount: result.current.tracks?.length || 0,
      });

      const currentMatch = result.current;
      
      // PR3: Duplicate checking is now handled by createRecord (UPSERT)
      // We can remove the manual duplicate check here

      // Proceed with save
      logger.debug('[useRecordSave] 💾 Starting save process...');
      
      // CRITICAL: Use unified image selection logic
      const { prepareImageFields } = require('../utils/imageSelection');
      const imageFields = prepareImageFields(
        currentMatch.coverImageRemoteUrl,
        capturedUri
      );
      
      logger.debug('[useRecordSave] 📝 Creating record in database...');
      logger.debug('[useRecordSave] Record data:', {
        title: currentMatch.title,
        artist: currentMatch.artist,
        year: currentMatch.year,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl ? 'SET' : 'NULL',
        coverImageLocalUri: imageFields.coverImageLocalUri ? 'SET' : 'NULL',
      });
      
      // PR3: createRecord now returns { record, isNew } and handles duplicates
      const { record: newRecord, isNew } = await createRecord({
        title: currentMatch.title,
        artist: currentMatch.artist,
        year: currentMatch.year ?? null,
        coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
        coverImageLocalUri: imageFields.coverImageLocalUri,
        discogsId: currentMatch.discogsId ? String(currentMatch.discogsId) : null,
      });
      
      if (!isNew) {
        // PR3: Record already exists - navigate to existing record instead
        logger.debug('[useRecordSave] ✅ Record already exists, navigating to existing record:', newRecord.id);
        Alert.alert('Record Already Exists', `"${newRecord.artist} - ${newRecord.title}" is already in your library.`, [
          {
            text: 'OK',
            onPress: () => {
              navigation.navigate('RecordDetail', { recordId: newRecord.id });
            },
          },
        ]);
        return; // Exit early - don't create tracks or save image hash again
      }
      
      logger.debug('[useRecordSave] ✅ Record created with ID:', newRecord.id);

      // Save tracks if available
      if (currentMatch.tracks && currentMatch.tracks.length > 0) {
        logger.debug(`[useRecordSave] ✅ Attempting to save ${currentMatch.tracks.length} tracks for record ${newRecord.id}`);
        logger.debug(`[useRecordSave] Track list:`, currentMatch.tracks.map((t, i) => `${i + 1}. ${t.title}`).join(', '));
        let savedCount = 0;
        let failedCount = 0;
        for (const track of currentMatch.tracks) {
          try {
            if (!track.title || !track.title.trim()) {
              logger.warn(`[useRecordSave] ⚠️ Skipping track with empty title`);
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
            logger.debug(`[useRecordSave] ✅ Saved track ${savedCount}: "${track.title}"`);
          } catch (error) {
            failedCount++;
            logger.error(`[useRecordSave] ❌ Failed to save track "${track.title}":`, error);
          }
        }
        if (savedCount > 0) {
          logger.debug(`[useRecordSave] ✅ Successfully saved ${savedCount}/${currentMatch.tracks.length} tracks`);
        }
        if (failedCount > 0) {
          logger.warn(`[useRecordSave] ⚠️ Failed to save ${failedCount} tracks`);
        }
      } else {
        logger.warn(`[useRecordSave] ⚠️ No tracks to save!`);
        logger.warn(`[useRecordSave] currentMatch.tracks:`, currentMatch.tracks);
        logger.warn(`[useRecordSave] tracks type:`, typeof currentMatch.tracks);
        logger.warn(`[useRecordSave] tracks length:`, currentMatch.tracks?.length);
      }

      // CRITICAL: Save image hash mapping for future cache lookups
      try {
        if (capturedUri) {
          const imageHash = await generateImageHash(capturedUri);
          if (imageHash) {
            await saveImageHash(imageHash, newRecord.id, capturedUri);
            logger.debug('[useRecordSave] ✅ Saved image hash for future cache lookups');
          }
        }
      } catch (error) {
        logger.warn('[useRecordSave] ⚠️ Failed to save image hash (non-critical):', error);
      }

      logger.debug('[useRecordSave] ✅ Record saved successfully');
      
      Alert.alert('Success', 'Record added to library!', [
        { 
          text: 'OK', 
          onPress: () => {
            logger.debug('[useRecordSave] 🏠 Navigating to LibraryHome...');
            navigation.navigate('LibraryHome');
          }
        },
      ]);
    } catch (error: any) {
      logger.error('[useRecordSave] ❌ Failed to save record', error);
      logger.error('[useRecordSave] Error details:', {
        message: error?.message,
        stack: error?.stack,
        name: error?.name,
      });
      Alert.alert('Error', 'Could not save record.');
    } finally {
      // CRITICAL: Always clear both ref and state
      savingRef.current = false;
      setSaving(false);
    }
  }, []);

  return {
    saving,
    saveRecord,
  };
}

