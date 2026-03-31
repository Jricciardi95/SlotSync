/**
 * IdentificationResult Component
 * 
 * Displays identification results and suggestions UI.
 * Handles result confirmation screen and suggestions review screen.
 */

import React from 'react';
import { View, StyleSheet, TouchableOpacity, Image, ActivityIndicator } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { LibraryStackParamList } from '../navigation/types';
import { ScanResult } from '../services/RecordIdentificationService';
import { AppCard } from './AppCard';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { AppIconButton } from './AppIconButton';
import { AppScreen } from './AppScreen';
import { useTheme } from '../hooks/useTheme';

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
  candidates?: any[]; // Legacy - deprecated
  extractedText?: string; // Debug only - not shown to user
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
} | null;

interface IdentificationResultProps {
  result: ScanResult | null;
  suggestions: SuggestionsState;
  selectedSuggestion: AlbumSuggestion | null;
  capturedUri: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onTryAnotherMatch: () => void;
  onSelectSuggestion: (suggestion: AlbumSuggestion | null) => void;
  onUseSuggestion: (suggestion: AlbumSuggestion, allSuggestions: AlbumSuggestion[]) => void;
  onClearSuggestions: () => void;
  onEnterManually: (imageUri?: string) => void;
  onRetry?: () => void | Promise<void>;
  navigation: NavigationProp<LibraryStackParamList>;
}

const ErrorRetryScreen: React.FC<{
  error: { code: string; message: string; retryable: boolean };
  capturedUri: string | null;
  onRetry: () => void;
  onCancel: () => void;
  onEnterManually: (imageUri?: string) => void;
}> = ({ error, capturedUri, onRetry, onCancel, onEnterManually }) => {
  const { colors, spacing } = useTheme();
  if (!error) return null;
  return (
    <AppScreen title="Could not identify">
      <View style={styles.screenContainer}>
        <View style={styles.headerActions}>
          <AppIconButton name="close" onPress={onCancel} />
        </View>
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
            {error.code !== 'UNKNOWN' ? error.code.replace(/_/g, ' ') : 'Error'}
          </AppText>
          <AppText variant="body" style={{ marginBottom: spacing.lg, color: colors.textSecondary }}>
            {error.message}
          </AppText>
          {error.retryable && (
            <AppButton title="Try again" onPress={onRetry} style={{ marginBottom: spacing.sm }} />
          )}
          <AppButton
            title="Enter manually"
            variant="secondary"
            onPress={() => onEnterManually(capturedUri ?? undefined)}
            style={{ marginBottom: spacing.sm }}
          />
          <AppButton title="Cancel" variant="ghost" onPress={onCancel} />
        </AppCard>
      </View>
    </AppScreen>
  );
};

// Helper function to sort tracks by position
const sortTracksByPosition = (tracks?: Array<{ title: string; position?: number }>) => {
  if (!tracks || tracks.length === 0) return [];
  
  return [...tracks].sort((a, b) => {
    if (a.position !== undefined && b.position !== undefined) {
      return a.position - b.position;
    }
    return 0;
  });
};

/**
 * Result Confirmation Screen
 * Shows the best match and allows saving or trying alternates
 */
export const ResultConfirmation: React.FC<{
  result: ScanResult;
  capturedUri: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
  onTryAnotherMatch: () => void;
  onEnterManually: (imageUri?: string) => void;
  navigation: NavigationProp<LibraryStackParamList>;
}> = ({
  result,
  capturedUri,
  saving,
  onCancel,
  onSave,
  onTryAnotherMatch,
  onEnterManually,
}) => {
  const { colors, spacing, radius } = useTheme();
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
            onPress={onCancel}
          />
        </View>
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.md }}>
            Best Match
          </AppText>
          
          {/* HD Cover Image */}
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
            
            {/* Tracklist */}
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
              onPress={() => onEnterManually(capturedUri || undefined)}
              style={{ flex: 1 }}
            />
            {hasAlternates && (
              <AppButton
                title="Try Another Match"
                variant="secondary"
                onPress={onTryAnotherMatch}
                style={{ flex: 1 }}
              />
            )}
            <AppButton
              title={saving ? "Saving..." : "Looks Good"}
              onPress={onSave}
              disabled={saving}
              style={{ flex: 1 }}
            />
          </View>
        </AppCard>
      </View>
    </AppScreen>
  );
};

/**
 * Suggestions Review Screen
 * Shows low-confidence suggestions for user to select
 */
export const SuggestionsReview: React.FC<{
  suggestions: SuggestionsState;
  selectedSuggestion: AlbumSuggestion | null;
  capturedUri: string | null;
  onCancel: () => void;
  onSelectSuggestion: (suggestion: AlbumSuggestion) => void;
  onUseSuggestion: (suggestion: AlbumSuggestion, allSuggestions: AlbumSuggestion[]) => void;
  onEnterManually: (imageUri?: string) => void;
  navigation: NavigationProp<LibraryStackParamList>;
}> = ({
  suggestions,
  selectedSuggestion,
  capturedUri,
  onCancel,
  onSelectSuggestion,
  onUseSuggestion,
  onEnterManually,
  navigation,
}) => {
  const { colors, spacing } = useTheme();
  const albumSuggestions = suggestions?.albumSuggestions || [];
  const hasSuggestions = albumSuggestions.length > 0;

  if (!hasSuggestions) {
    return null;
  }

  return (
    <AppScreen title="Review Suggestions">
      <View style={styles.screenContainer}>
        <View style={styles.headerActions}>
          <AppIconButton
            name="close"
            onPress={onCancel}
          />
        </View>
        <AppCard>
          <AppText variant="subtitle" style={{ marginBottom: spacing.sm }}>
            We found some possible matches:
          </AppText>
          <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
            {albumSuggestions
              .filter((suggestion: any) => {
                return suggestion && 
                       suggestion.albumTitle && 
                       typeof suggestion.albumTitle === 'string' && 
                       suggestion.albumTitle.trim().length > 0 &&
                       suggestion.artist &&
                       typeof suggestion.artist === 'string' &&
                       suggestion.artist.trim().length > 0 &&
                       suggestion.discogsId;
              })
              .slice(0, 8)
              .map((suggestion: AlbumSuggestion, idx: number) => {
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
                    onPress={() => onSelectSuggestion(suggestion)}
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
              onPress={() => onEnterManually(capturedUri || undefined)}
              style={{ flex: 1 }}
            />
            <AppButton
              title="Use This"
              onPress={() => {
                if (selectedSuggestion) {
                  onUseSuggestion(selectedSuggestion, albumSuggestions);
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
};

/**
 * Main IdentificationResult Component
 * Renders either result confirmation or suggestions review based on state
 */
export const IdentificationResult: React.FC<IdentificationResultProps> = ({
  result,
  suggestions,
  selectedSuggestion,
  capturedUri,
  saving,
  onCancel,
  onSave,
  onTryAnotherMatch,
  onSelectSuggestion,
  onUseSuggestion,
  onClearSuggestions,
  onEnterManually,
  onRetry,
  navigation,
}) => {
  const albumSuggestions = suggestions?.albumSuggestions || [];
  const hasSuggestions = albumSuggestions.length > 0;
  const hasError = suggestions?.error;

  // PR6: Show error retry screen if error is present (highest priority)
  if (hasError) {
    return (
      <ErrorRetryScreen
        error={hasError}
        capturedUri={capturedUri}
        onRetry={() => {
          onClearSuggestions();
          // PR6: Call retry function if provided
          if (onRetry) {
            onRetry();
          }
        }}
        onCancel={() => {
          onClearSuggestions();
          onCancel();
        }}
        onEnterManually={onEnterManually}
      />
    );
  }

  // Show suggestions if available (priority over result)
  if (suggestions && hasSuggestions) {
    return (
      <SuggestionsReview
        suggestions={suggestions}
        selectedSuggestion={selectedSuggestion}
        capturedUri={capturedUri}
        onCancel={() => {
          onClearSuggestions();
          onCancel();
        }}
        onSelectSuggestion={onSelectSuggestion}
        onUseSuggestion={onUseSuggestion}
        onEnterManually={onEnterManually}
        navigation={navigation}
      />
    );
  }

  // Show result confirmation
  if (result && result.current) {
    return (
      <ResultConfirmation
        result={result}
        capturedUri={capturedUri}
        saving={saving}
        onCancel={onCancel}
        onSave={onSave}
        onTryAnotherMatch={onTryAnotherMatch}
        onEnterManually={onEnterManually}
        navigation={navigation}
      />
    );
  }

  return null;
};

const styles = StyleSheet.create({
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
  matchCover: {
    width: 200,
    height: 200,
    alignSelf: 'center',
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
});

