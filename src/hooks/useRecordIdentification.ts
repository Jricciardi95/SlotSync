/**
 * useRecordIdentification Hook
 * 
 * Manages record identification state and API calls.
 * Handles identification requests, error handling, and result/suggestion state.
 */

import { useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  identifyRecord,
  identifyRecordByBarcode,
  IdentificationMatch,
  IdentificationError,
  normalizeScanResult,
  ScanResult,
} from '../services/RecordIdentificationService';
import { logger } from '../utils/logger';
import { trackBetaEvent } from '../monitoring/telemetry';

export type AlbumSuggestion = {
  artist: string;
  albumTitle: string;
  releaseYear?: number;
  discogsId: string;
  confidence: number;
  source?: string;
};

export type SuggestionsState = {
  albumSuggestions?: Array<AlbumSuggestion>;
  candidates?: IdentificationMatch[]; // Legacy - deprecated
  extractedText?: string; // Debug only - not shown to user
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
} | null;

export interface UseRecordIdentificationReturn {
  // State
  identifying: boolean;
  result: ScanResult | null;
  suggestions: SuggestionsState;
  selectedSuggestion: AlbumSuggestion | null;
  capturedUri: string | null;
  identifyingStage: 'scanning' | 'matching' | 'confirming' | null;
  
  // Actions
  identifyFromImage: (uri: string) => Promise<void>;
  identifyFromBarcode: (barcode: string) => Promise<void>;
  handleTryAnotherMatch: () => void;
  selectSuggestion: (suggestion: AlbumSuggestion | null) => void;
  setSuggestions: (suggestions: SuggestionsState) => void;
  setCapturedUri: (uri: string | null) => void;
  setResult: (result: ScanResult | null) => void;
  cancelIdentification: () => void;
  clearResult: () => void;
  retryIdentification: () => Promise<void>;
}

export function useRecordIdentification(): UseRecordIdentificationReturn {
  const [identifying, setIdentifying] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionsState>(null);
  const [selectedSuggestion, setSelectedSuggestion] = useState<AlbumSuggestion | null>(null);
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const [identifyingStage, setIdentifyingStage] = useState<'scanning' | 'matching' | 'confirming' | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const cancelIdentification = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIdentifying(false);
    setIdentifyingStage(null);
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setSuggestions(null);
    setSelectedSuggestion(null);
    setCapturedUri(null);
    setIdentifyingStage(null);
  }, []);

  const identifyFromImage = useCallback(async (uri: string) => {
    setCapturedUri(uri);
    setIdentifying(true);
    setIdentifyingStage('scanning');
    const startedAt = Date.now();
    trackBetaEvent('identify_started', { mode: 'image' });

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();
    const phase1 = setTimeout(() => setIdentifyingStage('matching'), 700);
    const phase2 = setTimeout(() => setIdentifyingStage('confirming'), 1800);

    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const response = await identifyRecord(uri, abortControllerRef.current.signal);
      logger.debug('[useRecordIdentification] Identification response:', {
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
        logger.warn('[useRecordIdentification] ⚠️ No tracks in response!');
        logger.warn('[useRecordIdentification] Full response.bestMatch:', JSON.stringify(response.bestMatch, null, 2));
      } else {
        logger.debug(`[useRecordIdentification] ✅ Received ${response.bestMatch.tracks.length} tracks from API`);
        logger.debug('[useRecordIdentification] First track sample:', response.bestMatch.tracks[0]);
      }
      
      // Normalize response into ScanResult structure
      const normalizedResult = normalizeScanResult(response);
      setResult(normalizedResult);
      setIdentifyingStage('confirming');
      trackBetaEvent('identify_succeeded', {
        mode: 'image',
        durationMs: Date.now() - startedAt,
        source: normalizedResult.current.source ?? 'unknown',
        confidence: normalizedResult.current.confidence ?? null,
      });
      abortControllerRef.current = null;
    } catch (error: any) {
      // Don't show error if request was aborted
      if (abortControllerRef.current?.signal.aborted) {
        setIdentifying(false);
        clearTimeout(phase1);
        clearTimeout(phase2);
        return;
      }
      
      // CRITICAL: Treat LOW_CONFIDENCE with candidates as suggestions, not a hard error
      if (error.code === 'LOW_CONFIDENCE') {
        const candidates = Array.isArray(error.candidates) ? error.candidates : [];
        
        // CRITICAL: Only show suggestions if we have valid album candidates
        const validCandidates = candidates.filter((c: any) => {
          return c && c.title && typeof c.title === 'string' && c.title.trim().length > 0;
        });
        
        // Check for albumSuggestions from backend (canonical Discogs releases)
        const albumSuggestions = (error as any).albumSuggestions || (error as any).discogsSuggestions || [];
        if (albumSuggestions.length > 0) {
          logger.debug(`[useRecordIdentification] Low confidence with ${albumSuggestions.length} canonical album suggestions - showing suggestions screen`);
          setSuggestions({
            albumSuggestions: albumSuggestions,
            extractedText: error.extractedText,
          });
          trackBetaEvent('identify_uncertain', {
            mode: 'image',
            durationMs: Date.now() - startedAt,
            suggestionsCount: albumSuggestions.length,
          });
          setIdentifying(false);
          return;
        }
        
        // Fallback: if no albumSuggestions but we have valid candidates, try to use them
        if (validCandidates.length > 0) {
          logger.debug(`[useRecordIdentification] Low confidence with ${validCandidates.length} candidates but no albumSuggestions - showing suggestions screen`);
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
          trackBetaEvent('identify_uncertain', {
            mode: 'image',
            durationMs: Date.now() - startedAt,
            suggestionsCount: validCandidates.length,
          });
          setIdentifying(false);
          return;
        }
        
        // No valid album candidates: skip suggestions UI and go straight to manual entry
        logger.debug(`[useRecordIdentification] Low confidence but no valid album candidates - showing manual entry prompt`);
        trackBetaEvent('identify_failed', {
          mode: 'image',
          durationMs: Date.now() - startedAt,
          reason: 'low_confidence_no_candidates',
        });
        setIdentifying(false);
        // Return error so caller can handle navigation
        throw error;
      }
      
      // PR6: Check if error is retryable
      const isRetryable = (error as any).retryable === true;
      const errorCode = error.code || (error as any).code || 'UNKNOWN';
      const errorMessage = error.message || (error as any).message || 'Unknown error occurred';
      
      // Hard errors: log and throw
      logger.error('[useRecordIdentification] Identification failed:', {
        code: errorCode,
        message: errorMessage,
        retryable: isRetryable,
        hasCandidates: !!error.candidates,
        candidatesCount: error.candidates?.length || 0,
        hasExtractedText: !!error.extractedText,
      });
      trackBetaEvent('identify_failed', {
        mode: 'image',
        durationMs: Date.now() - startedAt,
        reason: errorCode,
      });
      
      // PR6: Store error state for retry UI
      if (isRetryable) {
        // Store error for retry UI (preserve captured image)
        setSuggestions({
          error: {
            code: errorCode,
            message: errorMessage,
            retryable: true,
          },
        });
        setIdentifying(false);
        return;
      }
      
      // Check if we have any extracted text or candidates to show (fallback for non-LOW_CONFIDENCE errors)
      if (error.extractedText || (error.candidates && error.candidates.length > 0)) {
        const candidates = error.candidates || [];
        if (candidates.length > 0) {
          logger.debug(`[useRecordIdentification] Found ${candidates.length} candidates from error - showing suggestions`);
          setSuggestions({
            candidates: candidates,
            extractedText: error.extractedText,
          });
          setIdentifying(false);
          return;
        }
      }
      
      // PR6: Non-retryable errors - re-throw for caller to guide to manual flow
      throw error;
    } finally {
      clearTimeout(phase1);
      clearTimeout(phase2);
      setIdentifying(false);
      setIdentifyingStage(null);
      abortControllerRef.current = null;
    }
  }, []);

  const identifyFromBarcode = useCallback(async (barcode: string) => {
    setIdentifying(true);
    setIdentifyingStage('matching');
    const startedAt = Date.now();
    trackBetaEvent('identify_started', { mode: 'barcode' });
    
    try {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const response = await identifyRecordByBarcode(barcode);
      const normalizedResult = normalizeScanResult(response);
      setResult(normalizedResult);
      trackBetaEvent('identify_succeeded', {
        mode: 'barcode',
        durationMs: Date.now() - startedAt,
        source: normalizedResult.current.source ?? 'barcode',
        confidence: normalizedResult.current.confidence ?? null,
      });
    } catch (error: any) {
      logger.error('[useRecordIdentification] Barcode identification failed', error);
      trackBetaEvent('identify_failed', {
        mode: 'barcode',
        durationMs: Date.now() - startedAt,
        reason: error?.code ?? 'unknown',
      });
      throw error;
    } finally {
      setIdentifying(false);
      setIdentifyingStage(null);
    }
  }, []);

  const handleTryAnotherMatch = useCallback(() => {
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
  }, []);

  const selectSuggestion = useCallback((suggestion: AlbumSuggestion | null) => {
    setSelectedSuggestion(suggestion);
  }, []);

  // PR6: Retry function for retryable errors
  const retryIdentification = useCallback(async () => {
    if (!capturedUri) {
      logger.warn('[useRecordIdentification] Cannot retry: no captured image');
      return;
    }
    
    // Clear error state and retry
    setSuggestions(null);
    await identifyFromImage(capturedUri);
  }, [capturedUri, identifyFromImage, setSuggestions]);

  return {
    // State
    identifying,
    result,
    suggestions,
    selectedSuggestion,
    capturedUri,
    identifyingStage,
    
    // Actions
    identifyFromImage,
    identifyFromBarcode,
    handleTryAnotherMatch,
    selectSuggestion,
    setSuggestions,
    setCapturedUri,
    setResult,
    cancelIdentification,
    clearResult,
    retryIdentification, // PR6: Expose retry function
  };
}

